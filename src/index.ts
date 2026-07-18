import { readFile } from "node:fs/promises";
import { complete } from "@earendil-works/pi-ai/compat";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
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
  lifecycle: Pick<ExtensionAPI, "on">;
  sessionConfiguration: SessionConfigurationCapability;
}

export type PiPromptTitleRuntime = (
  capabilities: PiPromptTitleCapabilities,
) => void | Promise<void>;

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

const noOpRuntime: PiPromptTitleRuntime = () => undefined;

export function createPiPromptTitleExtension(
  options: PiPromptTitleExtensionOptions = {},
): ExtensionFactory {
  const runtime = options.runtime ?? noOpRuntime;
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
