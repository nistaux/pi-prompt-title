import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  attemptTitleGeneration,
  type TimerCapability,
  type TitleModelCapability,
} from "./attempt.js";
import type {
  ConfigurationFileCapability,
  SessionConfigurationCapability,
  SessionConfigurationState,
} from "./configuration.js";
import { formatStartupWarnings, preflightTitleModel } from "./warnings.js";

export interface UiDiagnosticsCapability {
  publish(ctx: ExtensionContext, warnings: readonly string[]): void;
}

export interface PiPromptTitleDependencies {
  titleModel: TitleModelCapability;
  timer: TimerCapability;
  configurationFiles: ConfigurationFileCapability;
  uiDiagnostics: UiDiagnosticsCapability;
}

export interface PiPromptTitleCapabilities extends PiPromptTitleDependencies {
  lifecycle: Pick<ExtensionAPI, "on" | "getSessionName" | "setSessionName">;
  sessionConfiguration: SessionConfigurationCapability;
}

export type PiPromptTitleRuntime = (
  capabilities: PiPromptTitleCapabilities,
) => void | Promise<void>;

interface TitleGenerationAttempt {
  controller: AbortController;
  sessionId: string;
  lifecycleRevision: number;
}

interface StartupWarningState {
  readonly lifecycleRevision: number;
  readonly sessionId: string;
  readonly configurationWarnings: readonly string[];
  modelAndAuthenticationResolved: boolean;
  modelOrAuthenticationWarningVisible: boolean;
}

function isEmptyTitle(title: string | undefined): boolean {
  return title === undefined || title.length === 0;
}

export const oneShotSessionTitleRuntime: PiPromptTitleRuntime = (capabilities) => {
  let sessionState: SessionConfigurationState | undefined;
  let runtimeActive = false;
  let sessionId: string | undefined;
  let lifecycleRevision = 0;
  let armed = false;
  let titleDisqualified = false;
  let activeAttempt: TitleGenerationAttempt | undefined;
  let currentWarnings: StartupWarningState | undefined;

  let currentDiagnosticsContext: ExtensionContext | undefined;

  const publishWarnings = (warnings: readonly string[]): void => {
    const ctx = currentDiagnosticsContext;
    if (ctx === undefined) return;
    capabilities.uiDiagnostics.publish(ctx, warnings);
  };

  const invalidateAttempt = () => {
    const attempt = activeAttempt;
    activeAttempt = undefined;
    if (attempt !== undefined && !attempt.controller.signal.aborted) {
      attempt.controller.abort();
    }
  };

  const permanentlyInvalidateSession = () => {
    armed = false;
    titleDisqualified = true;
    invalidateAttempt();
  };

  capabilities.sessionConfiguration.subscribe((state) => {
    sessionState = state;
  });

  capabilities.lifecycle.on("session_start", (event, ctx) => {
    invalidateAttempt();
    runtimeActive = true;
    currentDiagnosticsContext = ctx.mode === "tui" ? ctx : undefined;
    const sessionManager = ctx.sessionManager;
    const modelRegistry = ctx.modelRegistry;
    sessionId = sessionManager.getSessionId();
    lifecycleRevision += 1;

    const state = sessionState;
    if (state === undefined || !state.configuration.enabled) {
      armed = false;
      titleDisqualified = true;
      currentWarnings = undefined;
      publishWarnings([]);
      return;
    }

    const sessionTitle = capabilities.lifecycle.getSessionName();
    titleDisqualified = !isEmptyTitle(sessionTitle);
    const hasPriorUserMessage = sessionManager.getBranch().some(
      (entry) =>
        entry.type === "message" && entry.message.role === "user",
    );
    armed =
      (event.reason === "startup" || event.reason === "new") &&
      !titleDisqualified &&
      !hasPriorUserMessage;

    const warningState: StartupWarningState = {
      lifecycleRevision,
      sessionId,
      configurationWarnings: formatStartupWarnings(state, { kind: "ready" }),
      modelAndAuthenticationResolved: false,
      modelOrAuthenticationWarningVisible: false,
    };
    currentWarnings = warningState;
    publishWarnings(warningState.configurationWarnings);

    void preflightTitleModel(state.configuration, {
      modelRegistry,
      timer: capabilities.timer,
    })
      .then((preflight) => {
        if (
          !runtimeActive ||
          currentWarnings !== warningState ||
          sessionId !== warningState.sessionId ||
          lifecycleRevision !== warningState.lifecycleRevision ||
          warningState.modelAndAuthenticationResolved ||
          preflight.kind === "ready" ||
          preflight.kind === "disabled"
        ) {
          return;
        }

        warningState.modelOrAuthenticationWarningVisible = true;
        publishWarnings(formatStartupWarnings(state, preflight));
      })
      .catch(() => undefined);
  });

  capabilities.lifecycle.on("session_info_changed", (event) => {
    if (isEmptyTitle(event.name)) return;
    permanentlyInvalidateSession();
  });

  capabilities.lifecycle.on("session_tree", () => {
    lifecycleRevision += 1;
    permanentlyInvalidateSession();
  });

  capabilities.lifecycle.on("session_shutdown", () => {
    currentDiagnosticsContext = undefined;
    runtimeActive = false;
    lifecycleRevision += 1;
    permanentlyInvalidateSession();
  });

  capabilities.lifecycle.on("before_agent_start", (event, ctx) => {
    const state = sessionState;
    const sessionManager = ctx.sessionManager;
    const modelRegistry = ctx.modelRegistry;
    const currentSessionId = sessionManager.getSessionId();
    if (
      !runtimeActive ||
      !armed ||
      titleDisqualified ||
      activeAttempt !== undefined ||
      state === undefined ||
      !/\S/u.test(event.prompt) ||
      currentSessionId !== sessionId ||
      !isEmptyTitle(capabilities.lifecycle.getSessionName())
    ) {
      return;
    }

    // Consume the session's only opportunity before any fallible asynchronous work.
    armed = false;
    const attempt: TitleGenerationAttempt = {
      controller: new AbortController(),
      sessionId: currentSessionId,
      lifecycleRevision,
    };
    activeAttempt = attempt;
    const warningState = currentWarnings;

    void attemptTitleGeneration(event.prompt, state.configuration, {
      modelRegistry,
      titleModel: capabilities.titleModel,
      timer: capabilities.timer,
      signal: attempt.controller.signal,
      onModelAndAuthenticationResolved: () => {
        if (
          !runtimeActive ||
          activeAttempt !== attempt ||
          attempt.controller.signal.aborted ||
          currentWarnings !== warningState ||
          warningState === undefined ||
          sessionId !== attempt.sessionId ||
          lifecycleRevision !== attempt.lifecycleRevision
        ) {
          return;
        }

        warningState.modelAndAuthenticationResolved = true;
        if (warningState.modelOrAuthenticationWarningVisible) {
          warningState.modelOrAuthenticationWarningVisible = false;
          publishWarnings(warningState.configurationWarnings);
        }
      },
    })
      .then((title) => {
        if (
          title === undefined ||
          !runtimeActive ||
          activeAttempt !== attempt ||
          attempt.controller.signal.aborted ||
          titleDisqualified ||
          sessionId !== attempt.sessionId ||
          lifecycleRevision !== attempt.lifecycleRevision
        ) {
          return;
        }

        // Only a still-current runtime may touch its session-bound naming API.
        // Replacement and shutdown invalidate the plain state above synchronously.
        if (isEmptyTitle(capabilities.lifecycle.getSessionName())) {
          capabilities.lifecycle.setSessionName(title);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (activeAttempt === attempt) activeAttempt = undefined;
      });
  });
};
