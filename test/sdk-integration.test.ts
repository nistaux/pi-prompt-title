import {
  getModel,
  type Api,
  type AssistantMessage,
  type Model,
} from "@earendil-works/pi-ai/compat";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentSessionRuntime,
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSessionServices,
  type ExtensionAPI,
  type ExtensionContext,
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
  staleContextAccesses: number;
  staleLifecycleReads: number;
  staleLifecycleWrites: number;
  staleSessionManagerAccesses: number;
}

const sessions: Array<{ dispose(): void }> = [];
const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const session of sessions.splice(0)) session.dispose();
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

function runtimeAccessTracker(): RuntimeAccessTracker {
  return {
    stale: false,
    staleContextAccesses: 0,
    staleLifecycleReads: 0,
    staleLifecycleWrites: 0,
    staleSessionManagerAccesses: 0,
  };
}

function expectNoRuntimeAccess(tracker: RuntimeAccessTracker): void {
  expect(tracker).toMatchObject({
    staleContextAccesses: 0,
    staleLifecycleReads: 0,
    staleLifecycleWrites: 0,
    staleSessionManagerAccesses: 0,
  });
}

async function createPersistedSessionManager(): Promise<SessionManager> {
  const sessionDir = await mkdtemp(join(tmpdir(), "pi-prompt-title-sdk-"));
  temporaryRoots.push(sessionDir);
  return SessionManager.create(process.cwd(), sessionDir);
}

async function createSdkFixture(options: {
  tracker?: RuntimeAccessTracker;
  generationAuthentication?: ReturnType<typeof deferred<{ ok: true }>>;
  sessionId?: string;
  sessionManager?: SessionManager;
  sessionStartEvent?: SessionStartEvent;
} = {}) {
  const model = getModel("openai-codex", "gpt-5.4-mini");
  if (!model) throw new Error("Pi 0.80.10 default title model is missing");

  const completion = deferred<AssistantMessage>();
  const complete = vi.fn<TitleModelCompletion>(() => completion.promise);
  const read = vi.fn<ConfigurationFileCapability["read"]>(async () => {
    throw missingFileError();
  });
  const tracker = options.tracker;
  const sessionStartContexts: ExtensionContext[] = [];
  let authenticationRequests = 0;
  const generationAuthenticationRequested = vi.fn();
  const trackedContexts = new WeakMap<ExtensionContext, ExtensionContext>();
  const trackedModelRegistries = new WeakMap<object, object>();
  const trackedSessionManagers = new WeakMap<object, object>();

  const trackContext = (ctx: ExtensionContext): ExtensionContext => {
    if (tracker === undefined) return ctx;
    const existing = trackedContexts.get(ctx);
    if (existing !== undefined) return existing;

    const tracked = new Proxy(ctx, {
      get(target, property, receiver) {
        if (tracker.stale) tracker.staleContextAccesses += 1;
        const value = Reflect.get(target, property, receiver) as unknown;
        if (
          property === "sessionManager" &&
          typeof value === "object" &&
          value !== null
        ) {
          const existingSessionManager = trackedSessionManagers.get(value);
          if (existingSessionManager !== undefined) return existingSessionManager;
          const trackedSessionManager = new Proxy(value, {
            get(sessionManagerTarget, sessionManagerProperty, sessionManagerReceiver) {
              const sessionManagerValue = Reflect.get(
                sessionManagerTarget,
                sessionManagerProperty,
                sessionManagerReceiver,
              ) as unknown;
              if (typeof sessionManagerValue !== "function") {
                return sessionManagerValue;
              }
              return (...args: unknown[]) => {
                if (tracker.stale) tracker.staleSessionManagerAccesses += 1;
                return Reflect.apply(
                  sessionManagerValue,
                  sessionManagerTarget,
                  args,
                ) as unknown;
              };
            },
          });
          trackedSessionManagers.set(value, trackedSessionManager);
          return trackedSessionManager;
        }
        if (
          property !== "modelRegistry" ||
          options.generationAuthentication === undefined ||
          typeof value !== "object" ||
          value === null
        ) {
          return typeof value === "function" ? value.bind(target) : value;
        }

        const existingRegistry = trackedModelRegistries.get(value);
        if (existingRegistry !== undefined) return existingRegistry;
        const trackedRegistry = new Proxy(value, {
          get(registryTarget, registryProperty, registryReceiver) {
            const registryValue = Reflect.get(
              registryTarget,
              registryProperty,
              registryReceiver,
            ) as unknown;
            if (
              registryProperty !== "getApiKeyAndHeaders" ||
              typeof registryValue !== "function"
            ) {
              return typeof registryValue === "function"
                ? registryValue.bind(registryTarget)
                : registryValue;
            }
            return (...args: unknown[]) => {
              authenticationRequests += 1;
              if (authenticationRequests === 2) {
                generationAuthenticationRequested();
                return options.generationAuthentication?.promise;
              }
              return Reflect.apply(registryValue, registryTarget, args) as unknown;
            };
          },
        });
        trackedModelRegistries.set(value, trackedRegistry);
        return trackedRegistry;
      },
    });
    trackedContexts.set(ctx, tracked);
    return tracked;
  };

  const extension = createPiPromptTitleExtension({
    dependencies: {
      titleModel: { complete },
      timer: {
        schedule: (callback, delayMs) => setTimeout(callback, delayMs),
        cancel: (handle) => clearTimeout(handle),
      },
      configurationFiles: { read },
      uiDiagnostics: {
        publish: vi.fn((ctx) => {
          // Force real ExtensionContext access so stale diagnostics use is observable.
          void ctx.mode;
        }),
      },
    },
  });
  const trackedExtension: ExtensionFactory = tracker
    ? (pi) =>
        extension(
          new Proxy(pi, {
            get(target, property, receiver) {
              if (property === "on") {
                return (
                  event: string,
                  handler: (event: unknown, ctx: ExtensionContext) => unknown,
                ) =>
                  Reflect.apply(target.on, target, [
                    event,
                    (eventValue: unknown, ctx: ExtensionContext) =>
                      handler(eventValue, trackContext(ctx)),
                  ]);
              }
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

  const instrumentedExtension: ExtensionFactory = (pi) => {
    pi.on("session_start", (_event, ctx) => {
      sessionStartContexts.push(ctx);
    });
    return trackedExtension(pi);
  };

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: process.cwd(),
    settingsManager,
    extensionFactories: [instrumentedExtension],
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
  const { session, extensionsResult } = await createAgentSession({
    cwd: process.cwd(),
    model,
    modelRuntime,
    noTools: "all",
    resourceLoader: loader,
    sessionManager: concreteSessionManager,
    settingsManager,
    ...(options.sessionStartEvent === undefined
      ? {}
      : { sessionStartEvent: options.sessionStartEvent }),
  });
  sessions.push(session);
  expect(extensionsResult.errors).toEqual([]);
  await session.bindExtensions({ mode: "tui" });

  return {
    session,
    sessionManager: concreteSessionManager,
    extensionsResult,
    completion,
    complete,
    model,
    sessionStartContexts,
    generationAuthenticationRequested,
  };
}

type SdkFixture = Awaited<ReturnType<typeof createSdkFixture>>;

function createReplacementRuntime(oldFixture: SdkFixture) {
  const services = {
    cwd: process.cwd(),
    agentDir: process.cwd(),
  } as AgentSessionServices;
  let replacement: SdkFixture | undefined;
  const runtime = new AgentSessionRuntime(
    oldFixture.session,
    services,
    async ({ sessionManager, sessionStartEvent }) => {
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

  return {
    runtime,
    getReplacement(): SdkFixture {
      if (replacement === undefined) throw new Error("replacement was not created");
      return replacement;
    },
  };
}

function expectDistinctReplacement(
  oldFixture: SdkFixture,
  replacement: SdkFixture,
): void {
  expect(replacement.session).not.toBe(oldFixture.session);
  expect(replacement.session.extensionRunner).not.toBe(
    oldFixture.session.extensionRunner,
  );
  expect(replacement.sessionManager).not.toBe(oldFixture.sessionManager);
  expect(replacement.sessionStartContexts).toHaveLength(1);
  expect(oldFixture.sessionStartContexts).toHaveLength(1);
  expect(
    Object.is(
      replacement.sessionStartContexts[0],
      oldFixture.sessionStartContexts[0],
    ),
  ).toBe(false);
}

async function settleStaleCompletion(
  oldFixture: SdkFixture,
  replacement: SdkFixture,
  title: string,
): Promise<void> {
  oldFixture.completion.resolve(assistantMessage(oldFixture.model, title));
  await settleDetachedWork();

  expect(oldFixture.sessionManager.getSessionName()).toBeUndefined();
  expect(replacement.sessionManager.getSessionName()).toBeUndefined();
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

  it("invalidates pending work on real tree navigation", async () => {
    const fixture = await createSdkFixture();
    await emitSubstantivePrompt(fixture);
    await settleDetachedWork();
    const attemptSignal = fixture.complete.mock.calls[0]?.[2]?.signal;
    expect(attemptSignal?.aborted).toBe(false);

    const targetId = fixture.sessionManager.appendCustomEntry("tree-target");
    const oldLeafId = fixture.sessionManager.appendCustomEntry("abandoned-branch");
    expect(fixture.sessionManager.getLeafId()).toBe(oldLeafId);

    const result = await fixture.session.navigateTree(targetId);

    expect(result.cancelled).toBe(false);
    expect(fixture.sessionManager.getLeafId()).toBe(targetId);
    expect(attemptSignal?.aborted).toBe(true);

    fixture.completion.resolve(assistantMessage(fixture.model, "Tree title"));
    await settleDetachedWork();
    expect(fixture.sessionManager.getSessionName()).toBeUndefined();
  });

  it("keeps shutdown invalidation idempotent", async () => {
    const fixture = await createSdkFixture();
    await emitSubstantivePrompt(fixture);
    await settleDetachedWork();
    const attemptSignal = fixture.complete.mock.calls[0]?.[2]?.signal;
    expect(attemptSignal?.aborted).toBe(false);

    await fixture.session.extensionRunner.emit({
      type: "session_shutdown",
      reason: "reload",
    });
    await fixture.session.extensionRunner.emit({
      type: "session_shutdown",
      reason: "reload",
    });

    expect(attemptSignal?.aborted).toBe(true);
    fixture.completion.resolve(assistantMessage(fixture.model, "Reload title"));
    await settleDetachedWork();
    expect(fixture.sessionManager.getSessionName()).toBeUndefined();
  });

  it("does not touch stale runtime objects after a public new-session replacement", async () => {
    const oldTracker = runtimeAccessTracker();
    const generationAuthentication = deferred<{ ok: true }>();
    const oldFixture = await createSdkFixture({
      tracker: oldTracker,
      generationAuthentication,
      sessionId: "old-session",
    });
    const oldSessionId = oldFixture.sessionManager.getSessionId();
    await emitSubstantivePrompt(oldFixture);
    await vi.waitFor(() =>
      expect(oldFixture.generationAuthenticationRequested).toHaveBeenCalledOnce(),
    );
    expect(oldFixture.complete).not.toHaveBeenCalled();

    const replacementRuntime = createReplacementRuntime(oldFixture);
    oldTracker.stale = true;
    const result = await replacementRuntime.runtime.newSession();
    const replacement = replacementRuntime.getReplacement();

    expect(result.cancelled).toBe(false);
    expect(replacementRuntime.runtime.session).toBe(replacement.session);
    expectDistinctReplacement(oldFixture, replacement);
    expect(replacement.sessionManager.getSessionId()).not.toBe(oldSessionId);

    generationAuthentication.resolve({ ok: true });
    await settleStaleCompletion(
      oldFixture,
      replacement,
      "Stale new-session title",
    );
    expectNoRuntimeAccess(oldTracker);
  });

  it("does not touch old or resumed runtime objects after public session switching", async () => {
    const oldTracker = runtimeAccessTracker();
    const oldSessionManager = await createPersistedSessionManager();
    oldSessionManager.appendCustomEntry("old-session-seed");
    const oldFixture = await createSdkFixture({
      tracker: oldTracker,
      sessionManager: oldSessionManager,
    });
    await emitSubstantivePrompt(oldFixture);
    await settleDetachedWork();

    const resumedSessionManager = await createPersistedSessionManager();
    resumedSessionManager.appendCustomEntry("resume-target-seed");
    resumedSessionManager.appendMessage(
      assistantMessage(oldFixture.model, "Persist resume target"),
    );
    const resumedSessionPath = resumedSessionManager.getSessionFile();
    if (resumedSessionPath === undefined) {
      throw new Error("persisted resume target is missing its session file");
    }

    const replacementRuntime = createReplacementRuntime(oldFixture);
    oldTracker.stale = true;
    const result = await replacementRuntime.runtime.switchSession(
      resumedSessionPath,
    );
    const replacement = replacementRuntime.getReplacement();

    expect(result.cancelled).toBe(false);
    expect(replacementRuntime.runtime.session).toBe(replacement.session);
    expectDistinctReplacement(oldFixture, replacement);
    expect(replacement.sessionManager.getSessionId()).toBe(
      resumedSessionManager.getSessionId(),
    );

    await settleStaleCompletion(
      oldFixture,
      replacement,
      "Stale resumed-session title",
    );
    expectNoRuntimeAccess(oldTracker);
  });

  it("does not touch old or forked runtime objects after public session forking", async () => {
    const oldTracker = runtimeAccessTracker();
    const oldSessionManager = await createPersistedSessionManager();
    const forkEntryId = oldSessionManager.appendCustomEntry("fork-target");
    const oldFixture = await createSdkFixture({
      tracker: oldTracker,
      sessionManager: oldSessionManager,
    });
    const oldSessionId = oldFixture.sessionManager.getSessionId();
    await emitSubstantivePrompt(oldFixture);
    await settleDetachedWork();
    oldFixture.sessionManager.appendMessage(
      assistantMessage(oldFixture.model, "Persist fork source"),
    );

    const replacementRuntime = createReplacementRuntime(oldFixture);
    oldTracker.stale = true;
    const result = await replacementRuntime.runtime.fork(forkEntryId, {
      position: "at",
    });
    const replacement = replacementRuntime.getReplacement();

    expect(result.cancelled).toBe(false);
    expect(replacementRuntime.runtime.session).toBe(replacement.session);
    expectDistinctReplacement(oldFixture, replacement);
    expect(replacement.sessionManager.getSessionId()).not.toBe(oldSessionId);

    await settleStaleCompletion(
      oldFixture,
      replacement,
      "Stale forked-session title",
    );
    expectNoRuntimeAccess(oldTracker);
  });
});
