import { join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface ConfigurationFileCapability {
  read(path: string, signal?: AbortSignal): Promise<string>;
}

const CONFIGURATION_FILE_NAME = "pi-prompt-title.json";

export interface TitleModelIdentity {
  readonly provider: string;
  readonly id: string;
}

export interface TitleGenerationConfiguration {
  readonly enabled: boolean;
  readonly model: TitleModelIdentity;
  readonly timeoutMs: number;
}

export interface ConfigurationDiagnostic {
  readonly source: "global" | "project";
  readonly path: string;
  readonly message: string;
}

export interface SessionConfigurationState {
  readonly configuration: TitleGenerationConfiguration;
  readonly diagnostics: readonly ConfigurationDiagnostic[];
}

export type SessionConfigurationConsumer = (
  state: SessionConfigurationState,
) => void;

export interface SessionConfigurationCapability {
  subscribe(consumer: SessionConfigurationConsumer): () => void;
}

export function createSessionConfigurationCapability(): {
  capability: SessionConfigurationCapability;
  publish(state: SessionConfigurationState): void;
} {
  const consumers = new Set<SessionConfigurationConsumer>();
  return {
    capability: {
      subscribe(consumer) {
        consumers.add(consumer);
        return () => consumers.delete(consumer);
      },
    },
    publish(state) {
      for (const consumer of consumers) consumer(state);
    },
  };
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

interface ConfigurationLayer {
  enabled?: boolean;
  model?: TitleModelIdentity;
  timeoutMs?: number;
}

function freezeState(
  effective: TitleGenerationConfiguration,
  diagnostics: ConfigurationDiagnostic[],
): SessionConfigurationState {
  const model = Object.freeze({ ...effective.model });
  const configuration = Object.freeze({ ...effective, model });
  const frozenDiagnostics = Object.freeze(
    diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic })),
  );
  return Object.freeze({ configuration, diagnostics: frozenDiagnostics });
}

type ConfigurationSource = ConfigurationDiagnostic["source"];

type LayerLoadResult =
  | { readonly kind: "missing" }
  | { readonly kind: "valid"; readonly layer: ConfigurationLayer }
  | { readonly kind: "invalid"; readonly diagnostic: ConfigurationDiagnostic };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findUnknownProperty(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): string | undefined {
  return Object.keys(value).find((key) => !allowed.has(key));
}

function validateLayer(value: unknown):
  | { readonly valid: true; readonly layer: ConfigurationLayer }
  | { readonly valid: false; readonly message: string } {
  if (!isObject(value)) {
    return { valid: false, message: "Configuration must be a JSON object." };
  }
  const unknownProperty = findUnknownProperty(
    value,
    new Set(["enabled", "model", "timeoutMs"]),
  );
  if (unknownProperty !== undefined) {
    return {
      valid: false,
      message: `Unknown field ${JSON.stringify(unknownProperty)} is not supported.`,
    };
  }

  const layer: ConfigurationLayer = {};
  if (Object.hasOwn(value, "enabled")) {
    if (typeof value.enabled !== "boolean") {
      return { valid: false, message: '"enabled" must be a boolean.' };
    }
    layer.enabled = value.enabled;
  }

  if (Object.hasOwn(value, "model")) {
    if (!isObject(value.model)) {
      return { valid: false, message: '"model" must be an object.' };
    }
    const unknownModelProperty = findUnknownProperty(
      value.model,
      new Set(["provider", "id"]),
    );
    if (unknownModelProperty !== undefined) {
      return {
        valid: false,
        message: `Unknown field ${JSON.stringify(`model.${unknownModelProperty}`)} is not supported.`,
      };
    }
    if (!Object.hasOwn(value.model, "provider") || !Object.hasOwn(value.model, "id")) {
      return {
        valid: false,
        message: '"model" must contain both "provider" and "id".',
      };
    }
    if (typeof value.model.provider !== "string" || value.model.provider.length === 0) {
      return { valid: false, message: '"model.provider" must be a non-empty string.' };
    }
    if (typeof value.model.id !== "string" || value.model.id.length === 0) {
      return { valid: false, message: '"model.id" must be a non-empty string.' };
    }
    layer.model = { provider: value.model.provider, id: value.model.id };
  }

  if (Object.hasOwn(value, "timeoutMs")) {
    if (
      typeof value.timeoutMs !== "number" ||
      !Number.isInteger(value.timeoutMs) ||
      value.timeoutMs < 1_000 ||
      value.timeoutMs > 60_000
    ) {
      return {
        valid: false,
        message: '"timeoutMs" must be an integer from 1000 through 60000.',
      };
    }
    layer.timeoutMs = value.timeoutMs;
  }

  return { valid: true, layer };
}

async function readLayer(
  files: ConfigurationFileCapability,
  path: string,
  source: ConfigurationSource,
): Promise<LayerLoadResult> {
  let content: string;
  try {
    content = await files.read(path);
  } catch (error) {
    if (isMissingFile(error)) return { kind: "missing" };
    return {
      kind: "invalid",
      diagnostic: {
        source,
        path,
        message: "Configuration file could not be read.",
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return {
      kind: "invalid",
      diagnostic: {
        source,
        path,
        message: "Configuration file contains malformed JSON.",
      },
    };
  }

  const validation = validateLayer(parsed);
  return validation.valid
    ? { kind: "valid", layer: validation.layer }
    : {
        kind: "invalid",
        diagnostic: { source, path, message: validation.message },
      };
}

function mergeLayer(
  effective: TitleGenerationConfiguration,
  layer: ConfigurationLayer | undefined,
): TitleGenerationConfiguration {
  return layer === undefined
    ? effective
    : {
        enabled: layer.enabled ?? effective.enabled,
        model: layer.model ?? effective.model,
        timeoutMs: layer.timeoutMs ?? effective.timeoutMs,
      };
}

export async function loadSessionConfiguration(
  ctx: ExtensionContext,
  files: ConfigurationFileCapability,
): Promise<SessionConfigurationState> {
  let effective: TitleGenerationConfiguration = {
    enabled: true,
    model: { provider: "openai-codex", id: "gpt-5.4-mini" },
    timeoutMs: 10_000,
  };
  const diagnostics: ConfigurationDiagnostic[] = [];
  const globalPath = join(getAgentDir(), CONFIGURATION_FILE_NAME);
  const globalResult = await readLayer(files, globalPath, "global");
  if (globalResult.kind === "valid") {
    effective = mergeLayer(effective, globalResult.layer);
  } else if (globalResult.kind === "invalid") {
    diagnostics.push(globalResult.diagnostic);
  }

  if (ctx.isProjectTrusted()) {
    const projectPath = join(ctx.cwd, CONFIG_DIR_NAME, CONFIGURATION_FILE_NAME);
    const projectResult = await readLayer(files, projectPath, "project");
    if (projectResult.kind === "valid") {
      effective = mergeLayer(effective, projectResult.layer);
    } else if (projectResult.kind === "invalid") {
      diagnostics.push(projectResult.diagnostic);
    }
  }

  return freezeState(effective, diagnostics);
}
