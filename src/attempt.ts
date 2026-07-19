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
  let resolveTimeout!: (value: undefined) => void;
  const timeout = new Promise<undefined>((resolve) => {
    resolveTimeout = resolve;
  });
  let timeoutHandle: ReturnType<typeof setTimeout>;
  try {
    timeoutHandle = capabilities.timer.schedule(() => {
      controller.abort();
      resolveTimeout(undefined);
    }, configuration.timeoutMs);
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
    return await Promise.race([attempt, timeout]);
  } catch {
    return undefined;
  } finally {
    try {
      capabilities.timer.cancel(timeoutHandle);
    } catch {
      // Timer cleanup is best-effort and title attempts always fail silently.
    }
  }
}
