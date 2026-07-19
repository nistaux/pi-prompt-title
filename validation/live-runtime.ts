import { complete } from "@earendil-works/pi-ai/compat";
import {
  ModelRegistry,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import type { TitleModelCompletion } from "../src/index.js";
import type { ReleaseModelRegistry } from "./release-validation.js";

export async function createLiveValidationCapabilities(): Promise<{
  registry: ReleaseModelRegistry;
  complete: TitleModelCompletion;
}> {
  const runtime = await ModelRuntime.create();
  return {
    registry: new ModelRegistry(runtime),
    complete,
  };
}
