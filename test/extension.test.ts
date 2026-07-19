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
  type PiPromptTitleCapabilities,
  type TitleModelCompletion,
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
} = {}) {
  const handlers = new Map<string, LifecycleHandler[]>();
  const model = getModel("openai-codex", "gpt-5.4-mini");
  if (!model) throw new Error("Pi 0.80.10 default title model is missing");
  let sessionTitle = options.sessionTitle;
  const branch = options.branch ?? [];
  const read = vi.fn(async () => {
    if (options.configuration === undefined) throw missingFileError();
    return options.configuration;
  });
  const find = vi.fn(() => model);
  const getApiKeyAndHeaders = vi.fn(async () => ({ ok: true as const }));
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
  const getBranch = vi.fn(() => branch);
  const setSessionName = vi.fn((name: string) => {
    sessionTitle = name;
  });
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
  const ctx = {
    cwd: "workspace/project",
    isProjectTrusted: () => false,
    sessionManager: { getBranch },
    modelRegistry: { find, getApiKeyAndHeaders },
  } as unknown as ExtensionContext;
  const extension = createPiPromptTitleExtension({
    dependencies: {
      titleModel: { complete },
      timer: { schedule, cancel },
      configurationFiles: { read },
      uiDiagnostics: { publish: vi.fn() },
    },
  });

  async function emit(eventName: string, event: Record<string, unknown>) {
    const results = [];
    for (const handler of handlers.get(eventName) ?? []) {
      results.push(await handler(event, ctx));
    }
    return results;
  }

  return {
    async load() {
      await extension(pi);
      await emit("session_start", { type: "session_start", reason: "startup" });
    },
    emit,
    handlers,
    model,
    ctx,
    spies: {
      on,
      read,
      find,
      getApiKeyAndHeaders,
      complete,
      schedule,
      cancel,
      getSessionName,
      getBranch,
      setSessionName,
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

    expect(on).toHaveBeenCalledTimes(3);
    expect(on).toHaveBeenCalledWith("session_start", expect.any(Function));
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

    expect(on).toHaveBeenCalledTimes(3);
    expect([complete, schedule, cancel, read, publish]).toSatisfy(
      (spies: ReturnType<typeof vi.fn>[]) => spies.every((spy) => spy.mock.calls.length === 0),
    );
  });

  it("types UI diagnostics against Pi's public extension context", () => {
    const diagnostic: PiPromptTitleCapabilities["uiDiagnostics"]["publish"] = (
      _ctx: ExtensionContext,
      _message: string | undefined,
    ) => undefined;

    expect(diagnostic).toBeTypeOf("function");
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
    }
    expect(harness.spies.find).not.toHaveBeenCalled();
    expect(harness.spies.getApiKeyAndHeaders).not.toHaveBeenCalled();
    expect(harness.spies.complete).not.toHaveBeenCalled();
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
    expect(harness.spies.find).not.toHaveBeenCalled();

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
    const authentication = deferred<{ ok: true }>();
    harness.spies.getApiKeyAndHeaders.mockReturnValueOnce(authentication.promise);
    await harness.load();
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

    expect(harness.spies.find).toHaveBeenCalledOnce();
    expect(harness.spies.getApiKeyAndHeaders).toHaveBeenCalledOnce();
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

    expect(harness.spies.find).toHaveBeenCalledOnce();
    expect(harness.spies.getApiKeyAndHeaders).toHaveBeenCalledOnce();
    expect(harness.spies.complete).toHaveBeenCalledOnce();
    expect(harness.spies.setSessionName).not.toHaveBeenCalled();
  });
});
