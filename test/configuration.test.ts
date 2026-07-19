import { join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  createPiPromptTitleExtension,
  type PiPromptTitleDependencies,
  type SessionConfigurationState,
} from "../src/index.js";

type SessionStartHandler = (
  event: { type: "session_start"; reason: "startup" },
  ctx: ExtensionContext,
) => void | Promise<void>;

function missingFileError(): NodeJS.ErrnoException {
  return Object.assign(new Error("missing"), { code: "ENOENT" });
}

function createHarness(options: {
  files?: Readonly<Record<string, string | Error>>;
  trusted?: boolean;
} = {}) {
  let sessionStart: SessionStartHandler | undefined;
  let initialized = false;
  const read = vi.fn(async (path: string) => {
    const value = options.files?.[path];
    if (value === undefined) throw missingFileError();
    if (value instanceof Error) throw value;
    return value;
  });
  const complete = vi.fn();
  const schedule = vi.fn();
  const cancel = vi.fn();
  const publish = vi.fn();
  const snapshots: SessionConfigurationState[] = [];
  const dependencies: PiPromptTitleDependencies = {
    titleModel: { complete },
    timer: { schedule, cancel },
    configurationFiles: { read },
    uiDiagnostics: { publish },
  };
  const extension = createPiPromptTitleExtension({
    dependencies,
    runtime(capabilities) {
      capabilities.sessionConfiguration.subscribe((snapshot) => snapshots.push(snapshot));
    },
  });
  const on = vi.fn((event: string, handler: SessionStartHandler) => {
    if (event === "session_start") sessionStart = handler;
  });
  const cwd = join("workspace", "project");
  const findModel = vi.fn();
  const resolveCredentials = vi.fn();
  const ctx = {
    cwd,
    isProjectTrusted: () => options.trusted ?? false,
    modelRegistry: {
      find: findModel,
      getApiKeyAndHeaders: resolveCredentials,
    },
  } as unknown as ExtensionContext;

  return {
    async loadSession() {
      if (!initialized) {
        await extension({ on } as unknown as ExtensionAPI);
        initialized = true;
      }
      if (!sessionStart) throw new Error("session_start was not registered");
      await sessionStart({ type: "session_start", reason: "startup" }, ctx);
    },
    dependencies: {
      read,
      complete,
      schedule,
      cancel,
      publish,
      findModel,
      resolveCredentials,
    },
    lifecycle: { on },
    snapshots,
    paths: {
      global: join(getAgentDir(), "pi-prompt-title.json"),
      project: join(cwd, CONFIG_DIR_NAME, "pi-prompt-title.json"),
    },
  };
}

describe("session configuration snapshots", () => {
  it("publishes the exact deeply frozen built-in defaults when files are absent", async () => {
    const harness = createHarness();

    await harness.loadSession();

    expect(harness.snapshots).toHaveLength(1);
    const state = harness.snapshots[0];
    expect(state).toEqual({
      configuration: {
        enabled: true,
        model: { provider: "openai-codex", id: "gpt-5.4-mini" },
        timeoutMs: 10_000,
      },
      diagnostics: [],
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state?.configuration)).toBe(true);
    expect(Object.isFrozen(state?.configuration.model)).toBe(true);
    expect(Object.isFrozen(state?.diagnostics)).toBe(true);
    expect(harness.dependencies.read).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.read).toHaveBeenCalledWith(harness.paths.global);
  });

  it("merges top-level fields independently and replaces model identities atomically", async () => {
    const cwd = join("workspace", "project");
    const globalPath = join(getAgentDir(), "pi-prompt-title.json");
    const projectPath = join(cwd, CONFIG_DIR_NAME, "pi-prompt-title.json");
    const harness = createHarness({
      trusted: true,
      files: {
        [globalPath]: JSON.stringify({
          enabled: false,
          model: { provider: "Exact-Provider", id: "family/model:Version" },
        }),
        [projectPath]: JSON.stringify({ enabled: true, timeoutMs: 60_000 }),
      },
    });

    await harness.loadSession();

    expect(harness.snapshots[0]).toEqual({
      configuration: {
        enabled: true,
        model: { provider: "Exact-Provider", id: "family/model:Version" },
        timeoutMs: 60_000,
      },
      diagnostics: [],
    });
    expect(harness.dependencies.read.mock.calls.map(([path]) => path)).toEqual([
      harness.paths.global,
      harness.paths.project,
    ]);
  });

  it.each([
    ["malformed JSON", "{"],
    ["a non-object root", "null"],
    ["an array root", "[]"],
    ["an unknown top-level property", JSON.stringify({ timeoutMs: 3_000, extra: true })],
    ["a non-boolean enabled value", JSON.stringify({ enabled: "false" })],
    ["a non-object model", JSON.stringify({ model: null })],
    ["an incomplete model pair", JSON.stringify({ model: { provider: "p" }, timeoutMs: 3_000 })],
    ["an empty provider", JSON.stringify({ model: { provider: "", id: "m" } })],
    ["an empty model id", JSON.stringify({ model: { provider: "p", id: "" } })],
    ["an unknown model property", JSON.stringify({ model: { provider: "p", id: "m", alias: "x" } })],
    ["a fractional timeout", JSON.stringify({ timeoutMs: 1_000.5 })],
    ["a too-small timeout", JSON.stringify({ timeoutMs: 999 })],
    ["a too-large timeout", JSON.stringify({ timeoutMs: 60_001 })],
    ["a non-numeric timeout", JSON.stringify({ timeoutMs: "10000" })],
  ])("rejects the whole affected file for %s and preserves lower layers", async (_case, invalidProject) => {
    const cwd = join("workspace", "project");
    const globalPath = join(getAgentDir(), "pi-prompt-title.json");
    const projectPath = join(cwd, CONFIG_DIR_NAME, "pi-prompt-title.json");
    const harness = createHarness({
      trusted: true,
      files: {
        [globalPath]: JSON.stringify({
          enabled: false,
          model: { provider: "lower-provider", id: "lower-id" },
          timeoutMs: 2_000,
        }),
        [projectPath]: invalidProject,
      },
    });

    await harness.loadSession();

    expect(harness.snapshots[0]?.configuration).toEqual({
      enabled: false,
      model: { provider: "lower-provider", id: "lower-id" },
      timeoutMs: 2_000,
    });
    expect(harness.snapshots[0]?.diagnostics).toEqual([
      {
        source: "project",
        path: projectPath,
        message: expect.any(String),
      },
    ]);
    expect(harness.snapshots[0]?.diagnostics[0]?.message).not.toContain(invalidProject);
    expect(Object.isFrozen(harness.snapshots[0]?.diagnostics[0])).toBe(true);
  });

  it.each([
    ["extra", JSON.stringify({ extra: true })],
    ["model.alias", JSON.stringify({ model: { provider: "p", id: "m", alias: "x" } })],
  ])("identifies an unsupported %s field without displaying its value", async (field, content) => {
    const secretValue = "credential-secret-must-not-display";
    const harness = createHarness({
      files: {
        [join(getAgentDir(), "pi-prompt-title.json")]: content.replace(
          /true|"x"/u,
          JSON.stringify(secretValue),
        ),
      },
    });

    await harness.loadSession();

    expect(harness.snapshots[0]?.diagnostics[0]?.message).toBe(
      `Unknown field ${JSON.stringify(field)} is not supported.`,
    );
    expect(harness.snapshots[0]?.diagnostics[0]?.message).not.toContain(secretValue);
  });

  it("never reads project configuration when project trust is inactive", async () => {
    const cwd = join("workspace", "project");
    const projectPath = join(cwd, CONFIG_DIR_NAME, "pi-prompt-title.json");
    const harness = createHarness({
      trusted: false,
      files: {
        [projectPath]: JSON.stringify({ enabled: false }),
      },
    });

    await harness.loadSession();

    expect(harness.dependencies.read).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.read).toHaveBeenCalledWith(harness.paths.global);
    expect(harness.dependencies.read).not.toHaveBeenCalledWith(projectPath);
    expect(harness.snapshots[0]?.configuration.enabled).toBe(true);
    expect(harness.snapshots[0]?.diagnostics).toEqual([]);
  });

  it("returns sanitized frozen diagnostics for non-missing read failures", async () => {
    const secret = "credential=do-not-display";
    const harness = createHarness({
      files: {
        [join(getAgentDir(), "pi-prompt-title.json")]: Object.assign(
          new Error(secret),
          { code: "EACCES" },
        ),
      },
    });

    await harness.loadSession();

    const diagnostic = harness.snapshots[0]?.diagnostics[0];
    expect(diagnostic).toEqual({
      source: "global",
      path: harness.paths.global,
      message: "Configuration file could not be read.",
    });
    expect(JSON.stringify(diagnostic)).not.toContain(secret);
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(harness.snapshots[0]?.configuration.enabled).toBe(true);
  });

  it("keeps a snapshot unchanged until a later session_start publishes a new frozen snapshot", async () => {
    const files: Record<string, string> = {
      [join(getAgentDir(), "pi-prompt-title.json")]: JSON.stringify({ enabled: false }),
    };
    const harness = createHarness({ files });

    await harness.loadSession();
    const first = harness.snapshots[0];
    files[harness.paths.global] = JSON.stringify({ timeoutMs: 1_000 });

    expect(harness.snapshots).toHaveLength(1);
    expect(first?.configuration.enabled).toBe(false);
    await harness.loadSession();

    expect(harness.snapshots).toHaveLength(2);
    expect(harness.snapshots[1]).not.toBe(first);
    expect(harness.snapshots[1]?.configuration).toEqual({
      enabled: true,
      model: { provider: "openai-codex", id: "gpt-5.4-mini" },
      timeoutMs: 1_000,
    });
    expect(first?.configuration.enabled).toBe(false);
  });

  it("makes an effectively disabled session inert beyond loading and publishing its snapshot", async () => {
    const harness = createHarness({
      files: {
        [join(getAgentDir(), "pi-prompt-title.json")]: JSON.stringify({ enabled: false }),
      },
    });

    await harness.loadSession();

    expect(harness.snapshots[0]?.configuration.enabled).toBe(false);
    expect(harness.lifecycle.on.mock.calls.map(([event]) => event)).toEqual(["session_start"]);
    expect(harness.dependencies.findModel).not.toHaveBeenCalled();
    expect(harness.dependencies.resolveCredentials).not.toHaveBeenCalled();
    expect(harness.dependencies.complete).not.toHaveBeenCalled();
    expect(harness.dependencies.schedule).not.toHaveBeenCalled();
    expect(harness.dependencies.cancel).not.toHaveBeenCalled();
    expect(harness.dependencies.publish).not.toHaveBeenCalled();
  });
});
