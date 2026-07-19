import type {
  Api,
  Model,
  UserMessage,
} from "@earendil-works/pi-ai/compat";
import type { complete } from "@earendil-works/pi-ai/compat";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { TitleGenerationConfiguration } from "./configuration.js";
import {
  TITLE_GENERATION_INSTRUCTION,
  acceptTitleCompletion,
  boundSubstantivePrompt,
} from "./title.js";

export type TitleModelCompletion = (
  ...args: Parameters<typeof complete>
) => ReturnType<typeof complete>;

export interface TitleModelCapability {
  complete: TitleModelCompletion;
}

export interface TimerCapability {
  schedule(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  cancel(handle: ReturnType<typeof setTimeout>): void;
}

export type TitleModelRegistryCapability = Pick<
  ModelRegistry,
  "find" | "getApiKeyAndHeaders"
>;

export interface TitleGenerationAttemptCapabilities {
  modelRegistry: TitleModelRegistryCapability;
  titleModel: TitleModelCapability;
  timer: TimerCapability;
  signal?: AbortSignal;
  onModelAndAuthenticationResolved?: () => void;
}

async function runTitleModelAttempt(
  substantivePrompt: string,
  model: Model<Api>,
  signal: AbortSignal,
  capabilities: TitleGenerationAttemptCapabilities,
): Promise<string | undefined> {
  try {
    if (signal.aborted) return undefined;
    const auth = await capabilities.modelRegistry.getApiKeyAndHeaders(model);
    if (signal.aborted || !auth.ok) return undefined;
    try {
      capabilities.onModelAndAuthenticationResolved?.();
    } catch {
      // Observability must not alter the isolated title attempt.
    }

    const userMessage: UserMessage = {
      role: "user",
      content: [
        { type: "text", text: boundSubstantivePrompt(substantivePrompt) },
      ],
      timestamp: 0,
    };
    const completion = await capabilities.titleModel.complete(
      model,
      {
        systemPrompt: TITLE_GENERATION_INSTRUCTION,
        messages: [userMessage],
      },
      {
        ...(auth.apiKey === undefined ? {} : { apiKey: auth.apiKey }),
        ...(auth.headers === undefined ? {} : { headers: auth.headers }),
        ...(auth.env === undefined ? {} : { env: auth.env }),
        signal,
        reasoningEffort: "none",
      },
    );

    return signal.aborted ? undefined : acceptTitleCompletion(completion);
  } catch {
    return undefined;
  }
}

export async function attemptTitleGeneration(
  substantivePrompt: string,
  configuration: TitleGenerationConfiguration,
  capabilities: TitleGenerationAttemptCapabilities,
): Promise<string | undefined> {
  if (!configuration.enabled) return undefined;

  let model: Model<Api> | undefined;
  try {
    model = capabilities.modelRegistry.find(
      configuration.model.provider,
      configuration.model.id,
    );
  } catch {
    return undefined;
  }
  if (model === undefined) return undefined;

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (capabilities.signal?.aborted) {
    controller.abort();
  } else {
    capabilities.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  let resolveCancellation!: (value: undefined) => void;
  const cancellation = new Promise<undefined>((resolve) => {
    resolveCancellation = resolve;
  });
  const settleCancellation = () => resolveCancellation(undefined);
  controller.signal.addEventListener("abort", settleCancellation, { once: true });
  if (controller.signal.aborted) settleCancellation();

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    if (controller.signal.aborted) return undefined;
    try {
      timeoutHandle = capabilities.timer.schedule(
        () => controller.abort(),
        configuration.timeoutMs,
      );
    } catch {
      controller.abort();
      return undefined;
    }

    const attempt = runTitleModelAttempt(
      substantivePrompt,
      model,
      controller.signal,
      capabilities,
    );

    try {
      return await Promise.race([attempt, cancellation]);
    } catch {
      return undefined;
    }
  } finally {
    capabilities.signal?.removeEventListener("abort", abortFromCaller);
    controller.signal.removeEventListener("abort", settleCancellation);
    if (timeoutHandle !== undefined) {
      try {
        capabilities.timer.cancel(timeoutHandle);
      } catch {
        // Timer cleanup is best-effort and title attempts always fail silently.
      }
    }
  }
}
