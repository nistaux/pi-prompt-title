import {
  getModel,
  type Api,
  type AssistantMessage,
  type Model,
} from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import piPromptTitle, {
  createPiPromptTitleExtension,
  type ConfigurationFileCapability,
  type PiPromptTitleCapabilities,
  type TitleModelCompletion,
  type TitleModelRegistryCapability,
} from "../src/index.js";

function assistantMessage(model: Model<Api>, text: string): AssistantMessage {
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
    stopReason: "stop",
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

function missingFileError(): NodeJS.ErrnoException {
  return Object.assign(new Error("missing"), { code: "ENOENT" });
}

type LifecycleHandler = (
  event: Record<string, unknown>,
  ctx: ExtensionContext,
) => unknown;

function createLifecycleHarness(options: {
  configuration?: string;
  sessionTitle?: string;
  branch?: unknown[];
  mode?: ExtensionContext["mode"];
} = {}) {
  const handlers = new Map<string, LifecycleHandler[]>();
  const model = getModel("openai-codex", "gpt-5.4-mini");
  if (!model) throw new Error("Pi 0.80.10 default title model is missing");
  let sessionTitle = options.sessionTitle;
  let sessionId = "session-a";
  const branch = options.branch ?? [];
  const read = vi.fn<ConfigurationFileCapability["read"]>(async (_path) => {
    if (options.configuration === undefined) throw missingFileError();
    return options.configuration;
  });
  const find = vi.fn<TitleModelRegistryCapability["find"]>(() => model);
  const getApiKeyAndHeaders = vi.fn<
    TitleModelRegistryCapability["getApiKeyAndHeaders"]
  >(async () => ({ ok: true as const }));
  const complete = vi.fn<TitleModelCompletion>(async () =>
    assistantMessage(model, "Fix billing"),
  );
  const schedule = vi.fn((callback: () => void, delayMs: number) =>
    setTimeout(callback, delayMs),
  );
  const cancel = vi.fn((handle: ReturnType<typeof setTimeout>) =>
    clearTimeout(handle),
  );
  const getSessionName = vi.fn(() => sessionTitle);
  const getSessionId = vi.fn(() => sessionId);
  const getBranch = vi.fn(() => branch);
  const setSessionName = vi.fn((name: string) => {
    sessionTitle = name;
  });
  const publish = vi.fn();
  const activeSessionMutations = {
    setModel: vi.fn(),
    setThinkingLevel: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    appendEntry: vi.fn(),
  };
  const on = vi.fn((event: string, handler: LifecycleHandler) => {
    const eventHandlers = handlers.get(event) ?? [];
    eventHandlers.push(handler);
    handlers.set(event, eventHandlers);
  });
  const pi = {
    on,
    getSessionName,
    setSessionName,
    ...activeSessionMutations,
  } as unknown as ExtensionAPI;
  const activeResponse = new AbortController();
  const ctx = {
    cwd: "workspace/project",
    mode: options.mode ?? "tui",
    isProjectTrusted: () => false,
    sessionManager: { getBranch, getSessionId },
    modelRegistry: { find, getApiKeyAndHeaders },
    signal: activeResponse.signal,
  } as unknown as ExtensionContext;
  let initialized = false;
  const extension = createPiPromptTitleExtension({
    dependencies: {
      titleModel: { complete },
      timer: { schedule, cancel },
      configurationFiles: { read },
      uiDiagnostics: { publish },
    },
  });

  async function emit(eventName: string, event: Record<string, unknown>) {
    if (eventName === "session_info_changed") {
      sessionTitle = event.name as string | undefined;
    }
    const results = [];
    for (const handler of handlers.get(eventName) ?? []) {
      results.push(await handler(event, ctx));
    }
    return results;
  }

  return {
    async initialize() {
      if (initialized) return;
      await extension(pi);
      initialized = true;
    },
    async load() {
      await this.initialize();
      await emit("session_start", { type: "session_start", reason: "startup" });
    },
    emit,
    handlers,
    model,
    ctx,
    replaceSession(nextSessionId: string) {
      sessionId = nextSessionId;
    },
    abortActiveResponse() {
      activeResponse.abort();
    },
    spies: {
      on,
      read,
      find,
      getApiKeyAndHeaders,
      complete,
      schedule,
      cancel,
      getSessionName,
      getSessionId,
      getBranch,
      setSessionName,
      publish,
      ...activeSessionMutations,
    },
  };
}

describe("Pi Prompt Title extension seam", () => {
  it("loads production session-title behavior through its default export", async () => {
    const on = vi.fn();

    expect(
      await piPromptTitle({
        on,
        getSessionName: vi.fn(),
        setSessionName: vi.fn(),
      } as unknown as ExtensionAPI),
    ).toBeUndefined();

    expect(on).toHaveBeenCalledTimes(6);
    expect(on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(on).toHaveBeenCalledWith("session_info_changed", expect.any(Function));
    expect(on).toHaveBeenCalledWith("session_tree", expect.any(Function));
    expect(on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
    expect(on).toHaveBeenCalledWith("before_agent_start", expect.any(Function));
  });

  it("preserves the issue-agreed capabilities and exposes session snapshots to runtime behavior", async () => {
    const pi = { on: vi.fn() } as unknown as ExtensionAPI;
    const completeTitle = vi.fn();
    const schedule = vi.fn();
    const cancel = vi.fn();
    const readConfiguration = vi.fn();
    const publishDiagnostic = vi.fn();
    let received: PiPromptTitleCapabilities | undefined;

    const extension = createPiPromptTitleExtension({
      runtime(capabilities) {
        received = capabilities;
      },
      dependencies: {
        titleModel: { complete: completeTitle },
        timer: { schedule, cancel },
        configurationFiles: { read: readConfiguration },
        uiDiagnostics: { publish: publishDiagnostic },
      },
    });

    await extension(pi);

    expect(received).toMatchObject({
      lifecycle: pi,
      titleModel: { complete: completeTitle },
      timer: { schedule, cancel },
      configurationFiles: { read: readConfiguration },
      uiDiagnostics: { publish: publishDiagnostic },
      sessionConfiguration: { subscribe: expect.any(Function) },
    });
    expect(pi.on).toHaveBeenCalledTimes(1);
    expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(completeTitle).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(readConfiguration).not.toHaveBeenCalled();
    expect(publishDiagnostic).not.toHaveBeenCalled();
  });

  it("keeps injected effect boundaries untouched until a session starts", async () => {
    const on = vi.fn();
    const complete = vi.fn();
    const schedule = vi.fn();
    const cancel = vi.fn();
    const read = vi.fn();
    const publish = vi.fn();
    const extension = createPiPromptTitleExtension({
      dependencies: {
        titleModel: { complete },
        timer: { schedule, cancel },
        configurationFiles: { read },
        uiDiagnostics: { publish },
      },
    });

    await extension({ on } as unknown as ExtensionAPI);

    expect(on).toHaveBeenCalledTimes(6);
    expect([complete, schedule, cancel, read, publish]).toSatisfy(
      (spies: ReturnType<typeof vi.fn>[]) => spies.every((spy) => spy.mock.calls.length === 0),
    );
  });

  it("types UI diagnostics against Pi's public extension context", () => {
    const diagnostic: PiPromptTitleCapabilities["uiDiagnostics"]["publish"] = (
      _ctx: ExtensionContext,
      _warnings: readonly string[],
    ) => undefined;

    expect(diagnostic).toBeTypeOf("function");
  });
});

describe("actionable startup warnings", () => {
  it("publishes an exact-model startup warning only through the TUI widget boundary", async () => {
    const harness = createLifecycleHarness();
    harness.spies.find.mockReturnValueOnce(undefined);
    const consoleWarning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await harness.load();

    expect(harness.spies.find).toHaveBeenCalledWith(
      "openai-codex",
      "gpt-5.4-mini",
    );
    expect(harness.spies.getApiKeyAndHeaders).not.toHaveBeenCalled();
    expect(harness.spies.publish).toHaveBeenLastCalledWith(harness.ctx, [
      'Pi Prompt Title: "openai-codex"/"gpt-5.4-mini" is unavailable; check the model setting.',
    ]);
    expect(consoleWarning).not.toHaveBeenCalled();
    expect(Object.values({
      setModel: harness.spies.setModel,
      setThinkingLevel: harness.spies.setThinkingLevel,
      sendMessage: harness.spies.sendMessage,
      sendUserMessage: harness.spies.sendUserMessage,
      appendEntry: harness.spies.appendEntry,
    })).toSatisfy((spies: ReturnType<typeof vi.fn>[]) =>
      spies.every((spy) => spy.mock.calls.length === 0),
    );
    consoleWarning.mockRestore();
  });

  it.each(["rpc", "json", "print"] as const)(
    "does not publish startup diagnostics in %s mode",
    async (mode) => {
      const harness = createLifecycleHarness({ mode });
      harness.spies.find.mockReturnValueOnce(undefined);

      await harness.load();

      expect(harness.spies.find).toHaveBeenCalledOnce();
      expect(harness.spies.publish).not.toHaveBeenCalled();
    },
  );

  it("returns from session start, arms, and generates before credential preflight settles", async () => {
    const harness = createLifecycleHarness();
    const startupAuthentication = deferred<{
      ok: false;
      error: string;
    }>();
    harness.spies.getApiKeyAndHeaders.mockReturnValueOnce(
      startupAuthentication.promise,
    );
    await harness.initialize();

    const sessionStartHandlers = harness.handlers.get("session_start") ?? [];
    expect(sessionStartHandlers).toHaveLength(2);
    await sessionStartHandlers[0]?.(
      { type: "session_start", reason: "startup" },
      harness.ctx,
    );
    const runtimeResult = sessionStartHandlers[1]?.(
      { type: "session_start", reason: "startup" },
      harness.ctx,
    );

    expect(runtimeResult).toBeUndefined();
    await vi.waitFor(() =>
      expect(harness.spies.getApiKeyAndHeaders).toHaveBeenCalledOnce(),
    );
    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Fix billing",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());

    startupAuthentication.resolve({
      ok: false,
      error: "stale startup authentication failure",
    });
    await vi.waitFor(() => expect(harness.spies.cancel).toHaveBeenCalledTimes(2));

    expect(harness.spies.publish).toHaveBeenCalledOnce();
    expect(harness.spies.publish).toHaveBeenLastCalledWith(harness.ctx, []);
  });

  it("clears warning state and skips preflight when disabled", async () => {
    const harness = createLifecycleHarness({
      configuration: JSON.stringify({ enabled: false }),
    });

    await harness.load();

    expect(harness.spies.publish).toHaveBeenCalledOnce();
    expect(harness.spies.publish).toHaveBeenCalledWith(harness.ctx, []);
    expect(harness.spies.find).not.toHaveBeenCalled();
    expect(harness.spies.getApiKeyAndHeaders).not.toHaveBeenCalled();
    expect(harness.spies.schedule).not.toHaveBeenCalled();
  });

  it("ignores a stale preflight completion after a later session starts", async () => {
    const harness = createLifecycleHarness();
    const firstAuthentication = deferred<{
      ok: false;
      error: string;
    }>();
    harness.spies.getApiKeyAndHeaders
      .mockReturnValueOnce(firstAuthentication.promise)
      .mockResolvedValueOnce({ ok: true });
    await harness.initialize();

    const firstStart = harness.emit("session_start", {
      type: "session_start",
      reason: "startup",
    });
    await vi.waitFor(() =>
      expect(harness.spies.getApiKeyAndHeaders).toHaveBeenCalledOnce(),
    );
    const secondStart = harness.emit("session_start", {
      type: "session_start",
      reason: "new",
    });
    await secondStart;

    firstAuthentication.resolve({
      ok: false,
      error: "credential-secret from stale session",
    });
    await firstStart;

    expect(harness.spies.publish).not.toHaveBeenCalledWith(
      harness.ctx,
      expect.arrayContaining([expect.stringContaining("authentication is unavailable")]),
    );
    expect(harness.spies.publish).toHaveBeenLastCalledWith(harness.ctx, []);
  });

  it("clears only a stale model warning after generation resolves model and authentication", async () => {
    const harness = createLifecycleHarness({ configuration: "{" });
    harness.spies.find.mockReturnValueOnce(undefined);

    await harness.load();
    const configurationPath = harness.spies.read.mock.calls[0]?.[0];
    const configurationWarning =
      `Pi Prompt Title: ${JSON.stringify(configurationPath)}: Configuration file contains malformed JSON.`;
    expect(harness.spies.publish).toHaveBeenLastCalledWith(harness.ctx, [
      configurationWarning,
      'Pi Prompt Title: "openai-codex"/"gpt-5.4-mini" is unavailable; check the model setting.',
    ]);

    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Fix billing",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());

    expect(harness.spies.publish).toHaveBeenLastCalledWith(
      harness.ctx,
      [configurationWarning],
    );
  });

  it("does not publish through a stale diagnostics context when generation authentication resolves after shutdown", async () => {
    const harness = createLifecycleHarness();
    const authentication = deferred<{ ok: true }>();
    harness.spies.find.mockReturnValueOnce(undefined);
    harness.spies.getApiKeyAndHeaders.mockReturnValueOnce(authentication.promise);

    await harness.load();
    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Fix billing",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    await vi.waitFor(() =>
      expect(harness.spies.getApiKeyAndHeaders).toHaveBeenCalledOnce(),
    );
    const diagnosticCountBeforeShutdown = harness.spies.publish.mock.calls.length;

    await harness.emit("session_shutdown", {
      type: "session_shutdown",
      reason: "reload",
    });
    authentication.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.spies.publish).toHaveBeenCalledTimes(
      diagnosticCountBeforeShutdown,
    );
    expect(harness.spies.complete).not.toHaveBeenCalled();
    expect(harness.spies.setSessionName).not.toHaveBeenCalled();
  });

  it("keeps all failures after the title opportunity silent", async () => {
    const harness = createLifecycleHarness();
    await harness.load();
    harness.spies.publish.mockClear();
    harness.spies.complete.mockRejectedValueOnce(
      new Error("credential-secret prompt-secret generated-secret"),
    );
    const consoleWarning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "prompt-secret",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());
    await Promise.resolve();

    expect(harness.spies.publish).not.toHaveBeenCalled();
    expect(harness.spies.setSessionName).not.toHaveBeenCalled();
    expect(consoleWarning).not.toHaveBeenCalled();
    consoleWarning.mockRestore();
  });

  it("renders warning-colored text explicitly above the TUI editor", async () => {
    let publishDiagnostic: PiPromptTitleCapabilities["uiDiagnostics"]["publish"] | undefined;
    const extension = createPiPromptTitleExtension({
      runtime(capabilities) {
        publishDiagnostic = capabilities.uiDiagnostics.publish;
      },
    });
    await extension({ on: vi.fn() } as unknown as ExtensionAPI);
    if (publishDiagnostic === undefined) throw new Error("UI diagnostics were not exposed");
    const setWidget = vi.fn();
    const fg = vi.fn((_color: string, text: string) => `<yellow>${text}</yellow>`);
    const ctx = {
      mode: "tui",
      ui: { setWidget, theme: { fg } },
    } as unknown as ExtensionContext;

    publishDiagnostic(ctx, ["First warning", "Second warning"]);

    expect(fg).toHaveBeenCalledWith("warning", "First warning");
    expect(fg).toHaveBeenCalledWith("warning", "Second warning");
    expect(setWidget).toHaveBeenCalledWith(
      "pi-prompt-title",
      ["<yellow>First warning</yellow>", "<yellow>Second warning</yellow>"],
      { placement: "aboveEditor" },
    );
  });
});

describe("one-shot session title lifecycle", () => {
  it("detaches one title attempt for a fresh unnamed session and only applies its valid result", async () => {
    const harness = createLifecycleHarness();
    const completion = deferred<AssistantMessage>();
    harness.spies.complete.mockReturnValueOnce(completion.promise);
    await harness.load();
    const beforeAgentStart = harness.handlers.get("before_agent_start")?.[0];
    if (!beforeAgentStart) throw new Error("before_agent_start was not registered");

    const handlerResult = beforeAgentStart(
      {
        type: "before_agent_start",
        prompt: "Expanded substantive prompt",
        images: [],
        systemPrompt: "active context",
        systemPromptOptions: {},
      },
      harness.ctx,
    );

    expect(handlerResult).toBeUndefined();
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());
    expect(harness.spies.setSessionName).not.toHaveBeenCalled();

    completion.resolve(assistantMessage(harness.model, "Fix billing"));
    await vi.waitFor(() =>
      expect(harness.spies.setSessionName).toHaveBeenCalledWith("Fix billing"),
    );
    expect(Object.values({
      setModel: harness.spies.setModel,
      setThinkingLevel: harness.spies.setThinkingLevel,
      sendMessage: harness.spies.sendMessage,
      sendUserMessage: harness.spies.sendUserMessage,
      appendEntry: harness.spies.appendEntry,
    })).toSatisfy((spies: ReturnType<typeof vi.fn>[]) =>
      spies.every((spy) => spy.mock.calls.length === 0),
    );
  });

  it.each([
    {
      name: "disabled",
      options: { configuration: JSON.stringify({ enabled: false }) },
    },
    { name: "already named", options: { sessionTitle: "Manual title" } },
    {
      name: "resumed with a prior user message",
      options: {
        branch: [
          {
            type: "message",
            message: { role: "user", content: "Earlier prompt", timestamp: 0 },
          },
        ],
      },
    },
  ])("does not arm a $name session", async ({ options }) => {
    const harness = createLifecycleHarness(options);
    await harness.load();

    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Fix billing",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    await Promise.resolve();

    if (options.configuration !== undefined) {
      expect(harness.spies.getSessionName).not.toHaveBeenCalled();
      expect(harness.spies.getBranch).not.toHaveBeenCalled();
      expect(harness.spies.find).not.toHaveBeenCalled();
      expect(harness.spies.getApiKeyAndHeaders).not.toHaveBeenCalled();
    } else {
      expect(harness.spies.find).toHaveBeenCalledOnce();
      expect(harness.spies.getApiKeyAndHeaders).toHaveBeenCalledOnce();
    }
    expect(harness.spies.complete).not.toHaveBeenCalled();
    expect(harness.spies.setSessionName).not.toHaveBeenCalled();
  });

  it("permanently disqualifies a session that is named and then cleared before launch", async () => {
    const harness = createLifecycleHarness();
    await harness.load();

    await harness.emit("session_info_changed", {
      type: "session_info_changed",
      name: "Manual title",
    });
    await harness.emit("session_info_changed", {
      type: "session_info_changed",
      name: undefined,
    });
    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Fix billing",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });

    expect(harness.spies.complete).not.toHaveBeenCalled();
    expect(harness.spies.setSessionName).not.toHaveBeenCalled();
  });

  it("aborts and rejects an in-flight result after a manual title appears, without rearming when cleared", async () => {
    const harness = createLifecycleHarness();
    const completion = deferred<AssistantMessage>();
    harness.spies.complete.mockReturnValueOnce(completion.promise);
    await harness.load();

    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Fix billing",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());
    const signal = harness.spies.complete.mock.calls[0]?.[2]?.signal;
    expect(signal?.aborted).toBe(false);

    await harness.emit("session_info_changed", {
      type: "session_info_changed",
      name: "Manual title",
    });
    await harness.emit("session_info_changed", {
      type: "session_info_changed",
      name: undefined,
    });

    expect(signal?.aborted).toBe(true);
    completion.resolve(assistantMessage(harness.model, "Generated title"));
    await Promise.resolve();
    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Later prompt",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });

    expect(harness.spies.complete).toHaveBeenCalledOnce();
    expect(harness.spies.setSessionName).not.toHaveBeenCalled();
  });

  it.each([
    ["session_shutdown", { type: "session_shutdown", reason: "reload" }],
    [
      "session_tree",
      { type: "session_tree", oldLeafId: "prompt-a", newLeafId: "prompt-b" },
    ],
  ])("invalidates and aborts stale work on %s without retry", async (eventName, event) => {
    const harness = createLifecycleHarness();
    const completion = deferred<AssistantMessage>();
    harness.spies.complete.mockReturnValueOnce(completion.promise);
    await harness.load();
    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Fix billing",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());
    const signal = harness.spies.complete.mock.calls[0]?.[2]?.signal;

    await harness.emit(eventName, event);
    expect(signal?.aborted).toBe(true);
    completion.resolve(assistantMessage(harness.model, "Stale title"));
    await Promise.resolve();
    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Later prompt",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });

    expect(harness.spies.complete).toHaveBeenCalledOnce();
    expect(harness.spies.setSessionName).not.toHaveBeenCalled();
  });

  it("rejects a late result when the active session identity changes even without an event", async () => {
    const harness = createLifecycleHarness();
    const completion = deferred<AssistantMessage>();
    harness.spies.complete.mockReturnValueOnce(completion.promise);
    await harness.load();
    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Fix billing",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());

    harness.replaceSession("session-b");
    completion.resolve(assistantMessage(harness.model, "Stale title"));
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.spies.setSessionName).not.toHaveBeenCalled();
  });

  it.each(["reload", "resume", "fork"] as const)(
    "never rearms an empty session started for %s",
    async (reason) => {
      const harness = createLifecycleHarness();
      await harness.load();
      await harness.emit("session_start", { type: "session_start", reason });
      await harness.emit("before_agent_start", {
        type: "before_agent_start",
        prompt: "Fix billing",
        systemPrompt: "active context",
        systemPromptOptions: {},
      });

      expect(harness.spies.complete).not.toHaveBeenCalled();
    },
  );

  it("keeps current title work through response aborts and unrelated lifecycle activity", async () => {
    const harness = createLifecycleHarness();
    const completion = deferred<AssistantMessage>();
    harness.spies.complete.mockReturnValueOnce(completion.promise);
    await harness.load();
    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Fix billing",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());
    const titleSignal = harness.spies.complete.mock.calls[0]?.[2]?.signal;

    harness.abortActiveResponse();
    for (const [eventName, event] of [
      ["session_compact", { type: "session_compact" }],
      ["model_select", { type: "model_select" }],
      ["thinking_level_select", { type: "thinking_level_select" }],
      ["tool_execution_start", { type: "tool_execution_start" }],
      ["message_end", { type: "message_end" }],
    ] as const) {
      await harness.emit(eventName, event);
    }

    expect(titleSignal?.aborted).toBe(false);
    completion.resolve(assistantMessage(harness.model, "Fix billing"));
    await vi.waitFor(() =>
      expect(harness.spies.setSessionName).toHaveBeenCalledWith("Fix billing"),
    );
  });

  it("cleans up repeated invalidation paths idempotently", async () => {
    const harness = createLifecycleHarness();
    const completion = deferred<AssistantMessage>();
    harness.spies.complete.mockReturnValueOnce(completion.promise);
    await harness.load();
    await vi.waitFor(() => expect(harness.spies.cancel).toHaveBeenCalledOnce());
    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Fix billing",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());
    const signal = harness.spies.complete.mock.calls[0]?.[2]?.signal;
    const cancellationsBeforeInvalidation = harness.spies.cancel.mock.calls.length;
    const aborted = vi.fn();
    signal?.addEventListener("abort", aborted);

    await harness.emit("session_info_changed", {
      type: "session_info_changed",
      name: "Manual title",
    });
    await harness.emit("session_tree", {
      type: "session_tree",
      oldLeafId: "a",
      newLeafId: "b",
    });
    await harness.emit("session_shutdown", {
      type: "session_shutdown",
      reason: "reload",
    });

    expect(aborted).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(harness.spies.cancel).toHaveBeenCalledTimes(
        cancellationsBeforeInvalidation + 1,
      ),
    );
    completion.reject(new Error("late rejection"));
    await Promise.resolve();
    expect(harness.spies.setSessionName).not.toHaveBeenCalled();
  });

  it("keeps image-only and whitespace prompts armed until expanded text qualifies", async () => {
    const harness = createLifecycleHarness();
    await harness.load();

    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: " \t\n ",
      images: [{ type: "image", data: "not-forwarded", mimeType: "image/png" }],
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    expect(harness.spies.find).toHaveBeenCalledOnce();

    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Expanded skill or injected prompt",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());

    expect(harness.spies.complete.mock.calls[0]?.[1]).toMatchObject({
      messages: [
        {
          content: [{ type: "text", text: "Expanded skill or injected prompt" }],
        },
      ],
    });
  });

  it("consumes eligibility synchronously before concurrent prompt work can duplicate it", async () => {
    const harness = createLifecycleHarness();
    await harness.load();
    const authentication = deferred<{ ok: true }>();
    harness.spies.getApiKeyAndHeaders.mockReturnValueOnce(authentication.promise);
    const beforeAgentStart = harness.handlers.get("before_agent_start")?.[0];
    if (!beforeAgentStart) throw new Error("before_agent_start was not registered");
    const event = {
      type: "before_agent_start",
      prompt: "First qualifying prompt",
      systemPrompt: "active context",
      systemPromptOptions: {},
    };

    expect(beforeAgentStart(event, harness.ctx)).toBeUndefined();
    expect(beforeAgentStart({ ...event, prompt: "Queued prompt" }, harness.ctx)).toBeUndefined();

    expect(harness.spies.find).toHaveBeenCalledTimes(2);
    expect(harness.spies.getApiKeyAndHeaders).toHaveBeenCalledTimes(2);
    authentication.resolve({ ok: true });
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());
  });

  it("contains detached failures and never rearms after fallible work begins", async () => {
    const harness = createLifecycleHarness();
    harness.spies.complete.mockRejectedValueOnce(new Error("detached failure"));
    await harness.load();

    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "First qualifying prompt",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    await vi.waitFor(() => expect(harness.spies.complete).toHaveBeenCalledOnce());
    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Later qualifying prompt",
      systemPrompt: "active context",
      systemPromptOptions: {},
    });
    await Promise.resolve();

    expect(harness.spies.find).toHaveBeenCalledTimes(2);
    expect(harness.spies.getApiKeyAndHeaders).toHaveBeenCalledTimes(2);
    expect(harness.spies.complete).toHaveBeenCalledOnce();
    expect(harness.spies.setSessionName).not.toHaveBeenCalled();
  });
});
