import { join } from "node:path";
import { getModel } from "@earendil-works/pi-ai/compat";
import { describe, expect, it, vi } from "vitest";
import {
  formatStartupWarnings,
  preflightTitleModel,
  type SessionConfigurationState,
  type TimerCapability,
  type TitleGenerationConfiguration,
  type TitleModelRegistryCapability,
} from "../src/index.js";

const configuration: TitleGenerationConfiguration = {
  enabled: true,
  model: { provider: "Exact-Provider", id: "family/model:Version" },
  timeoutMs: 2_500,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createHarness() {
  const catalogModel = getModel("openai-codex", "gpt-5.4-mini");
  if (!catalogModel) throw new Error("Pi 0.80.10 default title model is missing");
  const model = {
    ...catalogModel,
    provider: configuration.model.provider,
    id: configuration.model.id,
  };
  const find = vi.fn<TitleModelRegistryCapability["find"]>(() => model);
  const getApiKeyAndHeaders = vi.fn<
    TitleModelRegistryCapability["getApiKeyAndHeaders"]
  >(async () => ({ ok: true, apiKey: "credential-secret" }));
  const scheduled: Array<() => void> = [];
  const schedule = vi.fn<TimerCapability["schedule"]>((callback) => {
    scheduled.push(callback);
    return setTimeout(() => undefined, 60_000);
  });
  const cancel = vi.fn<TimerCapability["cancel"]>((handle) => clearTimeout(handle));

  return {
    model,
    capabilities: {
      modelRegistry: { find, getApiKeyAndHeaders },
      timer: { schedule, cancel },
    },
    spies: { find, getApiKeyAndHeaders, schedule, cancel },
    scheduled,
  };
}

describe("startup title-model preflight", () => {
  it("resolves the exact enabled model and checks credentials within the configured timeout", async () => {
    const harness = createHarness();

    await expect(
      preflightTitleModel(configuration, harness.capabilities),
    ).resolves.toEqual({ kind: "ready" });

    expect(harness.spies.find).toHaveBeenCalledWith(
      "Exact-Provider",
      "family/model:Version",
    );
    expect(harness.spies.getApiKeyAndHeaders).toHaveBeenCalledWith(harness.model);
    expect(harness.spies.schedule).toHaveBeenCalledWith(
      expect.any(Function),
      2_500,
    );
    expect(harness.spies.cancel).toHaveBeenCalledOnce();
  });

  it("is inert when disabled", async () => {
    const harness = createHarness();

    await expect(
      preflightTitleModel(
        { ...configuration, enabled: false },
        harness.capabilities,
      ),
    ).resolves.toEqual({ kind: "disabled" });

    expect(harness.spies.find).not.toHaveBeenCalled();
    expect(harness.spies.getApiKeyAndHeaders).not.toHaveBeenCalled();
    expect(harness.spies.schedule).not.toHaveBeenCalled();
  });

  it("classifies unavailable models and sanitized authentication failures", async () => {
    const unavailable = createHarness();
    unavailable.spies.find.mockReturnValueOnce(undefined);
    await expect(
      preflightTitleModel(configuration, unavailable.capabilities),
    ).resolves.toEqual({ kind: "model-unavailable" });
    expect(unavailable.spies.getApiKeyAndHeaders).not.toHaveBeenCalled();

    const unauthenticated = createHarness();
    unauthenticated.spies.getApiKeyAndHeaders.mockResolvedValueOnce({
      ok: false,
      error: "credential-secret header-secret",
    });
    await expect(
      preflightTitleModel(configuration, unauthenticated.capabilities),
    ).resolves.toEqual({ kind: "authentication-unavailable" });
  });

  it("bounds a credential check that does not settle", async () => {
    const harness = createHarness();
    const authentication = deferred<{ ok: true; apiKey: string }>();
    harness.spies.getApiKeyAndHeaders.mockReturnValueOnce(authentication.promise);

    const result = preflightTitleModel(configuration, harness.capabilities);
    harness.scheduled[0]?.();

    await expect(result).resolves.toEqual({ kind: "authentication-timeout" });
    expect(harness.spies.cancel).toHaveBeenCalledOnce();

    authentication.resolve({ ok: true, apiKey: "late-secret" });
    await Promise.resolve();
  });
});

describe("startup warning formatting", () => {
  it("identifies sanitized configuration paths and known fields", () => {
    const secretContents = '{"enabled":"credential-secret"}';
    const path = join("workspace", ".pi", "pi-prompt-title.json");
    const state: SessionConfigurationState = {
      configuration,
      diagnostics: [
        {
          source: "project",
          path,
          message: '"enabled" must be a boolean.',
        },
      ],
    };

    const warnings = formatStartupWarnings(state, { kind: "ready" });

    expect(warnings).toEqual([
      `Pi Prompt Title: ${JSON.stringify(path)}: "enabled" must be a boolean.`,
    ]);
    expect(JSON.stringify(warnings)).not.toContain(secretContents);
  });

  it.each([
    [
      { kind: "model-unavailable" as const },
      'Pi Prompt Title: "Exact-Provider"/"family/model:Version" is unavailable; check the model setting.',
    ],
    [
      { kind: "authentication-unavailable" as const },
      'Pi Prompt Title: authentication is unavailable for "Exact-Provider"/"family/model:Version"; sign in or configure credentials.',
    ],
    [
      { kind: "authentication-timeout" as const },
      'Pi Prompt Title: credential check timed out for "Exact-Provider"/"family/model:Version"; check authentication.',
    ],
  ])("formats an actionable exact-model warning without sensitive values", (status, expected) => {
    const warnings = formatStartupWarnings(
      { configuration, diagnostics: [] },
      status,
    );

    expect(warnings).toEqual([expected]);
    expect(JSON.stringify(warnings)).not.toMatch(
      /credential-secret|header-secret|prompt-secret|generated-secret/u,
    );
  });
});
