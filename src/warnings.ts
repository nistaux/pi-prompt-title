import type {
  SessionConfigurationState,
  TitleGenerationConfiguration,
} from "./configuration.js";
import type {
  TimerCapability,
  TitleModelRegistryCapability,
} from "./attempt.js";

export type StartupPreflightStatus =
  | { readonly kind: "disabled" }
  | { readonly kind: "ready" }
  | { readonly kind: "model-unavailable" }
  | { readonly kind: "authentication-unavailable" }
  | { readonly kind: "authentication-timeout" };

export interface StartupPreflightCapabilities {
  readonly modelRegistry: TitleModelRegistryCapability;
  readonly timer: TimerCapability;
}

export async function preflightTitleModel(
  configuration: TitleGenerationConfiguration,
  capabilities: StartupPreflightCapabilities,
): Promise<StartupPreflightStatus> {
  if (!configuration.enabled) return { kind: "disabled" };

  let model;
  try {
    model = capabilities.modelRegistry.find(
      configuration.model.provider,
      configuration.model.id,
    );
  } catch {
    return { kind: "model-unavailable" };
  }
  if (model === undefined) return { kind: "model-unavailable" };

  let timeoutHandle: ReturnType<typeof setTimeout>;
  let resolveTimeout!: (status: StartupPreflightStatus) => void;
  const timeout = new Promise<StartupPreflightStatus>((resolve) => {
    resolveTimeout = resolve;
  });
  try {
    timeoutHandle = capabilities.timer.schedule(
      () => resolveTimeout({ kind: "authentication-timeout" }),
      configuration.timeoutMs,
    );
  } catch {
    return { kind: "authentication-unavailable" };
  }

  const credentialCheck = Promise.resolve()
    .then(() => capabilities.modelRegistry.getApiKeyAndHeaders(model))
    .then<StartupPreflightStatus>((auth) =>
      auth.ok
        ? { kind: "ready" }
        : { kind: "authentication-unavailable" },
    )
    .catch<StartupPreflightStatus>(() => ({
      kind: "authentication-unavailable",
    }));

  try {
    return await Promise.race([credentialCheck, timeout]);
  } finally {
    try {
      capabilities.timer.cancel(timeoutHandle);
    } catch {
      // Cleanup cannot make startup diagnostics less safe or more actionable.
    }
  }
}

export function formatStartupWarnings(
  state: SessionConfigurationState,
  status: StartupPreflightStatus,
): string[] {
  if (status.kind === "disabled") return [];

  const warnings = state.diagnostics.map(
    (diagnostic) =>
      `Pi Prompt Title: ${JSON.stringify(diagnostic.path)}: ${diagnostic.message}`,
  );
  const identity = `${JSON.stringify(state.configuration.model.provider)}/${JSON.stringify(state.configuration.model.id)}`;

  switch (status.kind) {
    case "ready":
      break;
    case "model-unavailable":
      warnings.push(
        `Pi Prompt Title: ${identity} is unavailable; check the model setting.`,
      );
      break;
    case "authentication-unavailable":
      warnings.push(
        `Pi Prompt Title: authentication is unavailable for ${identity}; sign in or configure credentials.`,
      );
      break;
    case "authentication-timeout":
      warnings.push(
        `Pi Prompt Title: credential check timed out for ${identity}; check authentication.`,
      );
      break;
  }

  return warnings;
}
