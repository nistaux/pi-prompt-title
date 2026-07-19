import {
  getModel,
  type Api,
  type AssistantMessage,
  type Model,
} from "@earendil-works/pi-ai/compat";
import {
  AgentSessionRuntime,
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSessionServices,
  type ExtensionAPI,
  type ExtensionFactory,
  type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPiPromptTitleExtension,
  type ConfigurationFileCapability,
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
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function missingFileError(): NodeJS.ErrnoException {
  return Object.assign(new Error("missing"), { code: "ENOENT" });
}

async function settleDetachedWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

interface RuntimeAccessTracker {
  stale: boolean;
  staleLifecycleReads: number;
  staleLifecycleWrites: number;
  staleSessionManagerReads: number;
}

const sessions: Array<{ dispose(): void }> = [];

afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
});

async function createSdkFixture(options: {
  completion?: ReturnType<typeof deferred<AssistantMessage>>;
  tracker?: RuntimeAccessTracker;
  sessionId?: string;
  sessionManager?: SessionManager;
  sessionStartEvent?: SessionStartEvent;
} = {}) {
  const model = getModel("openai-codex", "gpt-5.4-mini");
  if (!model) throw new Error("Pi 0.80.10 default title model is missing");

  const completion = options.completion ?? deferred<AssistantMessage>();
  const complete = vi.fn<TitleModelCompletion>(() => completion.promise);
  const read = vi.fn<ConfigurationFileCapability["read"]>(async () => {
    throw missingFileError();
  });
  const tracker = options.tracker;
  const extension = createPiPromptTitleExtension({
    dependencies: {
      titleModel: { complete },
      timer: {
        schedule: (callback, delayMs) => setTimeout(callback, delayMs),
        cancel: (handle) => clearTimeout(handle),
      },
      configurationFiles: { read },
      uiDiagnostics: { publish: vi.fn() },
    },
  });
  const trackedExtension: ExtensionFactory = tracker
    ? (pi) =>
        extension(
          new Proxy(pi, {
            get(target, property, receiver) {
              if (property === "getSessionName") {
                return () => {
                  if (tracker.stale) tracker.staleLifecycleReads += 1;
                  return target.getSessionName();
                };
              }
              if (property === "setSessionName") {
                return (name: string) => {
                  if (tracker.stale) tracker.staleLifecycleWrites += 1;
                  return target.setSessionName(name);
                };
              }
              return Reflect.get(target, property, receiver) as unknown;
            },
          }) as ExtensionAPI,
        )
    : extension;

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: process.cwd(),
    settingsManager,
    extensionFactories: [trackedExtension],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();

  const modelRuntime = await ModelRuntime.create({
    modelsPath: null,
    allowModelNetwork: false,
  });
  await modelRuntime.setRuntimeApiKey(model.provider, "sdk-integration-placeholder");

  const concreteSessionManager =
    options.sessionManager ??
    SessionManager.inMemory(
      process.cwd(),
      options.sessionId === undefined ? {} : { id: options.sessionId },
    );
  const sessionManager = tracker
    ? new Proxy(concreteSessionManager, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver) as unknown;
          if (property !== "getSessionId" || typeof value !== "function") {
            return typeof value === "function" ? value.bind(target) : value;
          }
          return () => {
            if (tracker.stale) tracker.staleSessionManagerReads += 1;
            return target.getSessionId();
          };
        },
      })
    : concreteSessionManager;

  const { session, extensionsResult } = await createAgentSession({
    cwd: process.cwd(),
    model,
    modelRuntime,
    noTools: "all",
    resourceLoader: loader,
    sessionManager,
    settingsManager,
    ...(options.sessionStartEvent === undefined
      ? {}
      : { sessionStartEvent: options.sessionStartEvent }),
  });
  sessions.push(session);
  expect(extensionsResult.errors).toEqual([]);
  await session.bindExtensions({ mode: "json" });

  return {
    session,
    sessionManager: concreteSessionManager,
    extensionsResult,
    completion,
    complete,
    model,
  };
}

async function emitSubstantivePrompt(
  fixture: Awaited<ReturnType<typeof createSdkFixture>>,
  prompt = "Fix the billing retry",
): Promise<void> {
  await fixture.session.extensionRunner.emitBeforeAgentStart(
    prompt,
    undefined,
    "",
    {
      cwd: process.cwd(),
      selectedTools: [],
      toolSnippets: {},
      promptGuidelines: [],
      appendSystemPrompt: "",
      contextFiles: [],
      skills: [],
    },
  );
}

describe("Pi 0.80.10 lifecycle-runner integration", () => {
  it("detaches one title attempt and persists a valid result through the real session manager", async () => {
    const fixture = await createSdkFixture();

    await emitSubstantivePrompt(fixture);
    await settleDetachedWork();

    expect(fixture.complete).toHaveBeenCalledTimes(1);
    expect(fixture.sessionManager.getSessionName()).toBeUndefined();

    fixture.completion.resolve(assistantMessage(fixture.model, "Fix billing retry"));
    await settleDetachedWork();

    expect(fixture.sessionManager.getSessionName()).toBe("Fix billing retry");
    expect(
      fixture.sessionManager.getEntries().filter((entry) => entry.type === "session_info"),
    ).toEqual([
      expect.objectContaining({ type: "session_info", name: "Fix billing retry" }),
    ]);

    fixture.session.setSessionName("Manual override");
    await settleDetachedWork();
    expect(fixture.sessionManager.getSessionName()).toBe("Manual override");
  });

  it("consumes eligibility before parallel runner emissions can launch duplicates", async () => {
    const fixture = await createSdkFixture();

    await Promise.all([
      emitSubstantivePrompt(fixture, "First expanded prompt"),
      emitSubstantivePrompt(fixture, "Queued expanded prompt"),
    ]);
    await settleDetachedWork();

    expect(fixture.complete).toHaveBeenCalledTimes(1);
  });

  it("preserves real manual naming and does not rearm after the name is cleared", async () => {
    const namedBeforePrompt = await createSdkFixture();
    namedBeforePrompt.session.setSessionName("Manual title");
    await settleDetachedWork();
    namedBeforePrompt.session.setSessionName("");
    await settleDetachedWork();

    await emitSubstantivePrompt(namedBeforePrompt);
    await settleDetachedWork();

    expect(namedBeforePrompt.complete).not.toHaveBeenCalled();

    const namedWhilePending = await createSdkFixture();
    await emitSubstantivePrompt(namedWhilePending);
    await settleDetachedWork();
    namedWhilePending.session.setSessionName("Manual title");
    await settleDetachedWork();
    namedWhilePending.session.setSessionName("");
    await settleDetachedWork();

    namedWhilePending.completion.resolve(
      assistantMessage(namedWhilePending.model, "Generated title"),
    );
    await settleDetachedWork();
    await emitSubstantivePrompt(namedWhilePending, "Another prompt");
    await settleDetachedWork();

    expect(namedWhilePending.complete).toHaveBeenCalledTimes(1);
    expect(namedWhilePending.sessionManager.getSessionName()).not.toBe(
      "Generated title",
    );
  });

  it("invalidates pending work on real tree and idempotent shutdown emissions", async () => {
    const navigated = await createSdkFixture();
    await emitSubstantivePrompt(navigated);
    await settleDetachedWork();
    await navigated.session.extensionRunner.emit({
      type: "session_tree",
      oldLeafId: null,
      newLeafId: null,
    });
    navigated.completion.resolve(assistantMessage(navigated.model, "Tree title"));
    await settleDetachedWork();
    expect(navigated.sessionManager.getSessionName()).toBeUndefined();

    const shutDown = await createSdkFixture();
    await emitSubstantivePrompt(shutDown);
    await settleDetachedWork();
    await shutDown.session.extensionRunner.emit({
      type: "session_shutdown",
      reason: "reload",
    });
    await shutDown.session.extensionRunner.emit({
      type: "session_shutdown",
      reason: "reload",
    });
    shutDown.completion.resolve(assistantMessage(shutDown.model, "Reload title"));
    await settleDetachedWork();
    expect(shutDown.sessionManager.getSessionName()).toBeUndefined();
  });

  it("does not touch stale runtime objects after a public runtime replacement", async () => {
    const tracker: RuntimeAccessTracker = {
      stale: false,
      staleLifecycleReads: 0,
      staleLifecycleWrites: 0,
      staleSessionManagerReads: 0,
    };
    const oldFixture = await createSdkFixture({ tracker, sessionId: "old-session" });
    const oldSessionId = oldFixture.sessionManager.getSessionId();
    await emitSubstantivePrompt(oldFixture);
    await settleDetachedWork();

    const services = {
      cwd: process.cwd(),
      agentDir: process.cwd(),
    } as AgentSessionServices;
    let replacement: Awaited<ReturnType<typeof createSdkFixture>> | undefined;
    const runtime = new AgentSessionRuntime(
      oldFixture.session,
      services,
      async ({ sessionManager, sessionStartEvent }) => {
        tracker.stale = true;
        replacement = await createSdkFixture({
          sessionManager,
          ...(sessionStartEvent === undefined ? {} : { sessionStartEvent }),
        });
        return {
          session: replacement.session,
          extensionsResult: replacement.extensionsResult,
          services,
          diagnostics: [],
        };
      },
    );

    await runtime.newSession();
    if (replacement === undefined) throw new Error("replacement was not created");
    expect(runtime.session).toBe(replacement.session);
    expect(runtime.session.extensionRunner).not.toBe(
      oldFixture.session.extensionRunner,
    );
    expect(replacement.sessionManager.getSessionId()).not.toBe(oldSessionId);

    oldFixture.completion.resolve(assistantMessage(oldFixture.model, "Stale title"));
    await settleDetachedWork();

    expect(oldFixture.sessionManager.getSessionName()).toBeUndefined();
    expect(replacement.sessionManager.getSessionName()).toBeUndefined();
    expect(tracker).toMatchObject({
      staleLifecycleReads: 0,
      staleLifecycleWrites: 0,
      staleSessionManagerReads: 0,
    });
  });
});
