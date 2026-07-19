import { readFile } from "node:fs/promises";
import { complete } from "@earendil-works/pi-ai/compat";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";

export {
  TITLE_GENERATION_INSTRUCTION,
  acceptTitleCompletion,
  boundSubstantivePrompt,
  extractTitleText,
  normalizeAndValidateTitle,
} from "./title.js";
export type { TitleCompletion } from "./title.js";

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

export interface ConfigurationFileCapability {
  read(path: string, signal?: AbortSignal): Promise<string>;
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

  return (pi) =>
    runtime({
      lifecycle: pi,
      ...dependencies,
    });
}

export default createPiPromptTitleExtension();
