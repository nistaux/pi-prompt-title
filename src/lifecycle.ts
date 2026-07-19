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
  TitleGenerationConfiguration,
} from "./configuration.js";

export interface UiDiagnosticsCapability {
  publish(ctx: ExtensionContext, message: string | undefined): void;
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
  context: ExtensionContext;
}

function isEmptyTitle(title: string | undefined): boolean {
  return title === undefined || title.length === 0;
}

export const oneShotSessionTitleRuntime: PiPromptTitleRuntime = (capabilities) => {
  let sessionConfiguration: TitleGenerationConfiguration | undefined;
  let runtimeActive = false;
  let sessionId: string | undefined;
  let lifecycleRevision = 0;
  let armed = false;
  let titleDisqualified = false;
  let activeAttempt: TitleGenerationAttempt | undefined;

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
    sessionConfiguration = state.configuration;
  });

  capabilities.lifecycle.on("session_start", (event, ctx) => {
    invalidateAttempt();
    runtimeActive = true;
    sessionId = ctx.sessionManager.getSessionId();
    lifecycleRevision += 1;

    const configuration = sessionConfiguration;
    if (
      configuration?.enabled !== true ||
      (event.reason !== "startup" && event.reason !== "new")
    ) {
      armed = false;
      titleDisqualified = true;
      return;
    }

    const sessionTitle = capabilities.lifecycle.getSessionName();
    titleDisqualified = !isEmptyTitle(sessionTitle);
    const hasPriorUserMessage = ctx.sessionManager.getBranch().some(
      (entry) =>
        entry.type === "message" && entry.message.role === "user",
    );
    armed = !titleDisqualified && !hasPriorUserMessage;
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
    runtimeActive = false;
    lifecycleRevision += 1;
    permanentlyInvalidateSession();
  });

  capabilities.lifecycle.on("before_agent_start", (event, ctx) => {
    const configuration = sessionConfiguration;
    const currentSessionId = ctx.sessionManager.getSessionId();
    if (
      !runtimeActive ||
      !armed ||
      titleDisqualified ||
      activeAttempt !== undefined ||
      configuration === undefined ||
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
      context: ctx,
    };
    activeAttempt = attempt;

    void attemptTitleGeneration(event.prompt, configuration, {
      modelRegistry: ctx.modelRegistry,
      titleModel: capabilities.titleModel,
      timer: capabilities.timer,
      signal: attempt.controller.signal,
    })
      .then((title) => {
        const currentTitle = capabilities.lifecycle.getSessionName();
        if (
          title !== undefined &&
          runtimeActive &&
          activeAttempt === attempt &&
          !attempt.controller.signal.aborted &&
          !titleDisqualified &&
          sessionId === attempt.sessionId &&
          attempt.context.sessionManager.getSessionId() === attempt.sessionId &&
          lifecycleRevision === attempt.lifecycleRevision &&
          isEmptyTitle(currentTitle)
        ) {
          capabilities.lifecycle.setSessionName(title);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (activeAttempt === attempt) activeAttempt = undefined;
      });
  });
};
