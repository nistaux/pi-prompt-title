import { readFile } from "node:fs/promises";
import { complete } from "@earendil-works/pi-ai/compat";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type {
  PiPromptTitleDependencies,
  PiPromptTitleRuntime,
} from "./lifecycle.js";
import { oneShotSessionTitleRuntime } from "./lifecycle.js";
import {
  createSessionConfigurationCapability,
  loadSessionConfiguration,
  type ConfigurationDiagnostic,
  type ConfigurationFileCapability,
  type SessionConfigurationCapability,
  type SessionConfigurationConsumer,
  type SessionConfigurationState,
  type TitleGenerationConfiguration,
  type TitleModelIdentity,
} from "./configuration.js";

export type {
  ConfigurationDiagnostic,
  ConfigurationFileCapability,
  SessionConfigurationCapability,
  SessionConfigurationConsumer,
  SessionConfigurationState,
  TitleGenerationConfiguration,
  TitleModelIdentity,
};

export { attemptTitleGeneration } from "./attempt.js";
export type {
  TimerCapability,
  TitleGenerationAttemptCapabilities,
  TitleModelCapability,
  TitleModelCompletion,
  TitleModelRegistryCapability,
} from "./attempt.js";

export {
  TITLE_GENERATION_INSTRUCTION,
  acceptTitleCompletion,
  boundSubstantivePrompt,
  extractTitleText,
  normalizeAndValidateTitle,
} from "./title.js";
export type { TitleCompletion } from "./title.js";

export type {
  PiPromptTitleCapabilities,
  PiPromptTitleDependencies,
  PiPromptTitleRuntime,
  UiDiagnosticsCapability,
} from "./lifecycle.js";

export interface PiPromptTitleExtensionOptions {
  runtime?: PiPromptTitleRuntime;
  dependencies?: PiPromptTitleDependencies;
}

const productionDependencies: PiPromptTitleDependencies = {
  titleModel: { complete },
  timer: {
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    cancel: (handle) => clearTimeout(handle),
  },
  configurationFiles: {
    read: (path, signal) =>
      signal === undefined
        ? readFile(path, "utf8")
        : readFile(path, { encoding: "utf8", signal }),
  },
  uiDiagnostics: {
    publish: (ctx, message) => {
      ctx.ui.setWidget(
        "pi-prompt-title",
        message === undefined ? undefined : [message],
      );
    },
  },
};

export function createPiPromptTitleExtension(
  options: PiPromptTitleExtensionOptions = {},
): ExtensionFactory {
  const runtime = options.runtime ?? oneShotSessionTitleRuntime;
  const dependencies = options.dependencies ?? productionDependencies;

  return (pi) => {
    const sessionConfiguration = createSessionConfigurationCapability();

    pi.on("session_start", async (_event, ctx) => {
      sessionConfiguration.publish(
        await loadSessionConfiguration(ctx, dependencies.configurationFiles),
      );
    });

    return runtime({
      lifecycle: pi,
      sessionConfiguration: sessionConfiguration.capability,
      ...dependencies,
    });
  };
}

export default createPiPromptTitleExtension();
