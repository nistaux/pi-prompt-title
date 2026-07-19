import {
  getModel,
  type Api,
  type AssistantMessage,
  type Model,
} from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  TITLE_GENERATION_INSTRUCTION,
  attemptTitleGeneration,
  createPiPromptTitleExtension,
  type TimerCapability,
  type TitleGenerationConfiguration,
  type TitleModelCapability,
  type TitleModelCompletion,
  type TitleModelRegistryCapability,
} from "../src/index.js";

function assistantMessage(
  model: Model<Api>,
  text: string,
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason,
    timestamp: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const configured: TitleGenerationConfiguration = {
  enabled: true,
  model: { provider: "Exact-Provider", id: "family/model:Version" },
  timeoutMs: 2_500,
};

function createHarness() {
  const catalogModel = getModel("openai-codex", "gpt-5.4-mini");
  if (!catalogModel) throw new Error("Pi 0.80.10 default title model is missing");
  const model: Model<Api> = {
    ...catalogModel,
    provider: configured.model.provider,
    id: configured.model.id,
  };
  const find = vi.fn<TitleModelRegistryCapability["find"]>(
    (_provider, _modelId) => model,
  );
  const getApiKeyAndHeaders = vi.fn<
    TitleModelRegistryCapability["getApiKeyAndHeaders"]
  >(async (_model) => ({
    ok: true,
    apiKey: "credential-secret",
    headers: { "x-secret": "header-secret" },
    env: { SECRET_ENV: "environment-secret" },
  }));
  const complete = vi.fn<TitleModelCompletion>(async (
    _model,
    _context,
    _options,
  ) => assistantMessage(model, "Fix billing"));
  const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
  const schedule = vi.fn((callback: () => void, delayMs: number) => {
    scheduled.push({ callback, delayMs });
    return setTimeout(() => undefined, 60_000);
  });
  const cancel = vi.fn((handle: ReturnType<typeof setTimeout>) => {
    clearTimeout(handle);
  });
  const modelRegistry: TitleModelRegistryCapability = {
    find,
    getApiKeyAndHeaders,
  };
  const timer: TimerCapability = { schedule, cancel };

  return {
    model,
    capabilities: {
      modelRegistry,
      titleModel: { complete: complete as TitleModelCompletion },
      timer,
    },
    spies: { find, getApiKeyAndHeaders, complete, schedule, cancel },
    scheduled,
  };
}

describe("attemptTitleGeneration", () => {
  it("is inert when the session configuration is disabled", async () => {
    const harness = createHarness();

    await expect(
      attemptTitleGeneration(
        "Fix billing",
        { ...configured, enabled: false },
        harness.capabilities,
      ),
    ).resolves.toBeUndefined();

    expect(harness.spies.find).not.toHaveBeenCalled();
    expect(harness.spies.getApiKeyAndHeaders).not.toHaveBeenCalled();
    expect(harness.spies.complete).not.toHaveBeenCalled();
    expect(harness.spies.schedule).not.toHaveBeenCalled();
  });

  it("resolves the exact configured model and returns one strictly accepted title", async () => {
    const harness = createHarness();
    const prompt = `${"a".repeat(600)} ${"b".repeat(398)} ${"c".repeat(20)}`;

    await expect(
      attemptTitleGeneration(prompt, configured, harness.capabilities),
    ).resolves.toBe("Fix billing");

    expect(harness.spies.find).toHaveBeenCalledOnce();
    expect(harness.spies.find).toHaveBeenCalledWith(
      "Exact-Provider",
      "family/model:Version",
    );
    expect(harness.spies.getApiKeyAndHeaders).toHaveBeenCalledOnce();
    expect(harness.spies.getApiKeyAndHeaders).toHaveBeenCalledWith(harness.model);
    expect(harness.spies.complete).toHaveBeenCalledOnce();
    expect(harness.spies.schedule).toHaveBeenCalledOnce();
    expect(harness.spies.schedule).toHaveBeenCalledWith(
      expect.any(Function),
      2_500,
    );
    expect(harness.spies.cancel).toHaveBeenCalledOnce();

    const [model, context, options] = harness.spies.complete.mock.calls[0] ?? [];
    expect(model).toBe(harness.model);
    expect(context).toEqual({
      systemPrompt: TITLE_GENERATION_INSTRUCTION,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${"a".repeat(600)} ${"b".repeat(398)}`,
            },
          ],
          timestamp: 0,
        },
      ],
    });
    expect(context).not.toHaveProperty("tools");
    expect(JSON.stringify(context)).not.toContain("secret");
    expect(options).toEqual({
      apiKey: "credential-secret",
      headers: { "x-secret": "header-secret" },
      env: { SECRET_ENV: "environment-secret" },
      signal: expect.any(AbortSignal),
      reasoningEffort: "none",
    });
    expect(options).not.toHaveProperty("reasoningSummary");
    expect(options?.signal).not.toBeUndefined();
    expect(options?.signal?.aborted).toBe(false);
  });

  it("observes successful model and authentication resolution without exposing attempt failures", async () => {
    const success = createHarness();
    const onModelAndAuthenticationResolved = vi.fn();

    await expect(
      attemptTitleGeneration("Fix billing", configured, {
        ...success.capabilities,
        onModelAndAuthenticationResolved,
      }),
    ).resolves.toBe("Fix billing");

    expect(onModelAndAuthenticationResolved).toHaveBeenCalledOnce();
    expect(
      onModelAndAuthenticationResolved.mock.invocationCallOrder[0] ?? Infinity,
    ).toBeLessThan(success.spies.complete.mock.invocationCallOrder[0] ?? Infinity);

    const failure = createHarness();
    const onFailedResolution = vi.fn();
    failure.spies.getApiKeyAndHeaders.mockResolvedValueOnce({
      ok: false,
      error: "credential-secret",
    });

    await expect(
      attemptTitleGeneration("Fix billing", configured, {
        ...failure.capabilities,
        onModelAndAuthenticationResolved: onFailedResolution,
      }),
    ).resolves.toBeUndefined();
    expect(onFailedResolution).not.toHaveBeenCalled();
  });

  it("fails silently before authentication when the exact model is unavailable", async () => {
    const harness = createHarness();
    harness.spies.find.mockReturnValueOnce(undefined);

    await expect(
      attemptTitleGeneration("Fix billing", configured, harness.capabilities),
    ).resolves.toBeUndefined();

    expect(harness.spies.find).toHaveBeenCalledOnce();
    expect(harness.spies.getApiKeyAndHeaders).not.toHaveBeenCalled();
    expect(harness.spies.complete).not.toHaveBeenCalled();
    expect(harness.spies.schedule).not.toHaveBeenCalled();
    expect(harness.spies.cancel).not.toHaveBeenCalled();
  });

  it("consumes authentication and completion failures without retry or fallback", async () => {
    const authenticationFailure = createHarness();
    authenticationFailure.spies.getApiKeyAndHeaders.mockResolvedValueOnce({
      ok: false,
      error: "credential-secret must not escape",
    });

    await expect(
      attemptTitleGeneration(
        "Fix billing",
        configured,
        authenticationFailure.capabilities,
      ),
    ).resolves.toBeUndefined();
    expect(authenticationFailure.spies.find).toHaveBeenCalledOnce();
    expect(authenticationFailure.spies.getApiKeyAndHeaders).toHaveBeenCalledOnce();
    expect(authenticationFailure.spies.complete).not.toHaveBeenCalled();

    const completionFailure = createHarness();
    completionFailure.spies.complete.mockRejectedValueOnce(
      new Error("provider failure containing secret"),
    );

    await expect(
      attemptTitleGeneration(
        "Fix billing",
        configured,
        completionFailure.capabilities,
      ),
    ).resolves.toBeUndefined();
    expect(completionFailure.spies.find).toHaveBeenCalledOnce();
    expect(completionFailure.spies.getApiKeyAndHeaders).toHaveBeenCalledOnce();
    expect(completionFailure.spies.complete).toHaveBeenCalledOnce();
  });

  it("rejects an unusable completion without repair or retry", async () => {
    const harness = createHarness();
    harness.spies.complete.mockResolvedValueOnce(
      assistantMessage(harness.model, '"Fix billing"'),
    );

    await expect(
      attemptTitleGeneration("Fix billing", configured, harness.capabilities),
    ).resolves.toBeUndefined();

    expect(harness.spies.complete).toHaveBeenCalledOnce();
  });

  it("starts one timeout before authentication and prevents late auth from invoking completion", async () => {
    const harness = createHarness();
    const authentication = deferred<{
      ok: true;
      apiKey: string;
      headers: Record<string, string>;
      env: Record<string, string>;
    }>();
    harness.spies.getApiKeyAndHeaders.mockReturnValueOnce(authentication.promise);

    const result = attemptTitleGeneration(
      "Fix billing",
      configured,
      harness.capabilities,
    );
    expect(harness.spies.schedule).toHaveBeenCalledOnce();
    expect(harness.spies.getApiKeyAndHeaders).toHaveBeenCalledOnce();
    expect(
      harness.spies.schedule.mock.invocationCallOrder[0] ?? Infinity,
    ).toBeLessThan(
      harness.spies.getApiKeyAndHeaders.mock.invocationCallOrder[0] ?? Infinity,
    );

    harness.scheduled[0]?.callback();
    await expect(result).resolves.toBeUndefined();

    authentication.resolve({
      ok: true,
      apiKey: "late-secret",
      headers: {},
      env: {},
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.spies.complete).not.toHaveBeenCalled();
    expect(harness.spies.cancel).toHaveBeenCalledOnce();
  });

  it("settles and cleans up when the lifecycle aborts an in-flight completion", async () => {
    const harness = createHarness();
    const completion = deferred<AssistantMessage>();
    const lifecycle = new AbortController();
    harness.spies.complete.mockReturnValueOnce(completion.promise);

    const result = attemptTitleGeneration("Fix billing", configured, {
      ...harness.capabilities,
      signal: lifecycle.signal,
    });
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());
    const signal = harness.spies.complete.mock.calls[0]?.[2]?.signal;

    lifecycle.abort();
    await expect(result).resolves.toBeUndefined();

    expect(signal?.aborted).toBe(true);
    expect(harness.spies.cancel).toHaveBeenCalledOnce();
    completion.reject(new Error("late rejection"));
    await Promise.resolve();
  });

  it("aborts the single in-flight completion when the shared timeout expires", async () => {
    const harness = createHarness();
    const completion = deferred<AssistantMessage>();
    harness.spies.complete.mockReturnValueOnce(completion.promise);

    const result = attemptTitleGeneration(
      "Fix billing",
      configured,
      harness.capabilities,
    );
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());
    const signal = harness.spies.complete.mock.calls[0]?.[2]?.signal;
    expect(signal?.aborted).toBe(false);

    harness.scheduled[0]?.callback();
    await expect(result).resolves.toBeUndefined();

    expect(signal?.aborted).toBe(true);
    expect(harness.spies.complete).toHaveBeenCalledOnce();
    expect(harness.spies.cancel).toHaveBeenCalledOnce();
    completion.reject(new Error("late rejection"));
    await Promise.resolve();
  });
});

describe("Pi 0.80.10 production compatibility adapter", () => {
  it("serializes explicit no-reasoning generation with no tools before network access", async () => {
    let productionTitleModel: TitleModelCapability | undefined;
    const extension = createPiPromptTitleExtension({
      runtime(capabilities) {
        productionTitleModel = capabilities.titleModel;
      },
    });
    const activeSessionMutations = {
      setModel: vi.fn(),
      setThinkingLevel: vi.fn(),
      sendMessage: vi.fn(),
      sendUserMessage: vi.fn(),
    };
    await extension({
      on: vi.fn(),
      ...activeSessionMutations,
    } as unknown as ExtensionAPI);
    if (productionTitleModel === undefined) {
      throw new Error("Production title-model adapter was not exposed");
    }

    const model = getModel("openai-codex", "gpt-5.4-mini");
    if (!model) throw new Error("Pi 0.80.10 default title model is missing");
    const tokenPayload = Buffer.from(
      JSON.stringify({
        "https://api.openai.com/auth": {
          chatgpt_account_id: "offline-account",
        },
      }),
    ).toString("base64url");
    const syntheticToken = `e30.${tokenPayload}.signature`;
    let payload: unknown;

    const response = await productionTitleModel.complete(
      model,
      {
        systemPrompt: TITLE_GENERATION_INSTRUCTION,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Fix billing" }],
            timestamp: 0,
          },
        ],
      },
      {
        apiKey: syntheticToken,
        headers: { "x-offline-secret": "header-secret" },
        reasoningEffort: "none",
        onPayload(serialized) {
          payload = serialized;
          throw new Error("offline interception sentinel");
        },
      },
    );

    expect(response.stopReason).toBe("error");
    expect(response.errorMessage).toBe("offline interception sentinel");
    expect(payload).toMatchObject({
      instructions: TITLE_GENERATION_INSTRUCTION,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: "Fix billing" }],
        },
      ],
      reasoning: { effort: "none" },
    });
    expect(payload).not.toHaveProperty("tools");
    expect(JSON.stringify(payload)).not.toContain(syntheticToken);
    expect(JSON.stringify(payload)).not.toContain("header-secret");
    expect(
      (payload as { reasoning?: { summary?: string } }).reasoning?.summary,
    ).toBe("auto");
    expect(Object.values(activeSessionMutations)).toSatisfy(
      (spies: ReturnType<typeof vi.fn>[]) =>
        spies.every((spy) => spy.mock.calls.length === 0),
    );
  });
});
