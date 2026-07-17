# Research: Pi extension seams for asynchronous session naming

## Summary

Pi 0.80.10 has the necessary public extension seams for an initial asynchronous session-naming extension: `before_agent_start` identifies the first prompt that actually reaches the agent; `ctx.modelRegistry.find()` plus `getApiKeyAndHeaders()` and `complete()` can make an independent model call; and `pi.getSessionName()`/`pi.setSessionName()` read and write the persisted display name. The naming call must be launched without awaiting it from the lifecycle handler, guarded by a per-session latch and repeated name/session checks, because Pi awaits async extension handlers and exposes no dedicated background-task scheduler.

Pi cannot identify *who* set an existing title. It can only report whether a title exists and notify on changes. Therefore the safe initial requirement is “never replace any non-empty existing session name,” which conservatively protects `/name`, `--name`, RPC names, and names from other extensions.

## Findings

1. **Use `before_agent_start`, not `input`, as the primary first-substantive-prompt seam.** The event is emitted after command handling and prompt/template expansion, immediately before the agent loop, and provides `BeforeAgentStartEvent { type: "before_agent_start"; prompt: string; images?: ImageContent[]; systemPrompt: string; systemPromptOptions: BuildSystemPromptOptions }`. By contrast, `input` sees raw text before skill/template expansion and is skipped for registered extension commands. Arm the extension at `session_start`, inspect `ctx.sessionManager.getBranch()` for an existing user message, and atomically latch on the first qualifying `before_agent_start`. This avoids renaming resumed sessions and duplicate launches from queued prompts. “Substantive” is not defined by Pi; the product must define it (recommended initial rule: non-whitespace expanded text, optionally treating image-only input as substantive). [Extensions lifecycle and events](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) [Session format and `SessionManager`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md)

2. **An independent selected-model call is supported by current public APIs.** Resolve a configured title model with `ctx.modelRegistry.find(provider, modelId): Model | undefined`; resolve request credentials with `await ctx.modelRegistry.getApiKeyAndHeaders(model)`, whose result is `{ ok: true, apiKey?, headers?, env? } | { ok: false, error }`; then call `complete(model, { systemPrompt, messages }, { apiKey, headers, env, signal })` from `@earendil-works/pi-ai/compat`. Pi’s complete `qna.ts` and `handoff.ts` examples use exactly this path. The model need not become the active session model, so do **not** call `pi.setModel()` for title generation. [Q&A example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/qna.ts) [Handoff example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/handoff.ts) [Models documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md)

3. **Non-blocking means detaching the model promise from the awaited event handler.** `pi.on()` handlers may be async, and Pi awaits the handler result; awaiting `complete()` in `before_agent_start` would delay the active agent run. The handler should synchronously capture plain values, set the latch, start `void generateTitle(...).catch(...)`, and return. Pi exposes no `spawnBackgroundTask` API. Maintain an extension-owned `AbortController`, abort it in idempotent `session_shutdown`, and verify the captured session ID still equals `ctx.sessionManager.getSessionId()` immediately before applying the name. Do not reuse session-bound objects after replacement; Pi explicitly documents old contexts/`SessionManager` objects as stale after new/resume/fork flows. The detached call is separately billed and its usage is not part of the active session’s assistant usage accounting. [Async handlers and shutdown guidance](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) [SDK prompting/model behavior](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)

4. **Manual-name protection is possible only as conservative existence protection.** `pi.getSessionName(): string | undefined` reads the current name; `pi.setSessionName(name: string): void` persists a session-info entry and emits `session_info_changed`; that event carries only `{ name: string | undefined }`. Names can originate from `/name`, `--name`, RPC, or `setSessionName()`, but the API exposes no origin/author field. Check `getSessionName()` before launching and again immediately before setting; if either is non-empty, skip. Listen to `session_info_changed` if an explicit “user named while generation was running” flag is useful, but it still cannot identify provenance. If the extension later needs to distinguish its own generated title, persist a custom marker with `pi.appendEntry()`; do not infer provenance from the title string. [Session-name APIs and event](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) [Session naming example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/session-name.ts) [Session info entry format](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md)

5. **Applying the title is public and persisted, but validation policy belongs to the extension.** `setSessionName()` is the safe public writer and causes `session_info_changed`; avoid direct JSONL writes or `ReadonlySessionManager` mutation. Pi documents the event’s value as the “current normalized name,” but does not document normalization rules, length limits, or conflict arbitration. The extension should extract text blocks only, trim, collapse whitespace/newlines, reject empty output, remove surrounding quotes/prefixes, impose its own conservative character/length limit, then re-check name and session identity before `setSessionName()`. Last-check wins cannot be made atomic through the public API, so a narrow race remains if another extension names the session between the final check and call. [Extension API](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)

6. **Configuration can be read, but there is no extension-specific configuration service on `ExtensionContext`.** The public context includes `cwd`, `isProjectTrusted()`, model/session/UI fields, and no generic settings getter. The official `preset.ts` example reads a dedicated global JSON file under `getAgentDir()` and a project file under `join(ctx.cwd, CONFIG_DIR_NAME, ...)`, then lets project values override global values. Follow that pattern for (for example) `prompt-title.json`; only honor project-local config when `ctx.isProjectTrusted()` is true, use `CONFIG_DIR_NAME` rather than hard-coding `.pi`, validate parsed data, and fall back safely. `SettingsManager` is documented for Pi’s typed built-in settings and SDK composition, not arbitrary extension keys. [Preset example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/preset.ts) [Settings documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md) [SDK settings management](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)

7. **Diagnostics are available through console and optional UI, not a structured extension logger.** The extension types expose no `ctx.logger`/`pi.log`. Official examples use `console.error()` for failures and `ctx.ui.notify()` for user-visible status. Pi states extension errors are logged and the agent continues, but detached promises must have their own `.catch()` to avoid unhandled rejections. Recommended initial behavior: concise namespaced `console.warn/error` messages with no prompt, API key, headers, or generated sensitive text; optional `notify` only for actionable configuration/auth errors and guarded by `ctx.hasUI`. `ctx.mode` is `"tui" | "rpc" | "json" | "print"`; UI methods are no-ops in JSON/print. [Error and mode behavior](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) [TUI debug logging](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/tui.md)

8. **Installation and local testing are first-class.** For quick tests use `pi -e ./extension.ts`; auto-discovered extensions live in `~/.pi/agent/extensions/` or trusted project `.pi/extensions/` and support `/reload`. Distribution can be an npm/git Pi package with a `package.json` `pi.extensions` manifest (or conventional `extensions/` directory), installed with `pi install npm:...`, `pi install git:...`, or a local path. Runtime dependencies belong in `dependencies`; Pi core packages and `typebox` belong in `peerDependencies` with `"*"`. Packages execute arbitrary code with full user permissions, so provenance/review must be explicit. [Packages documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md) [README installation and CLI reference](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md)

9. **Testing can cover logic without a real persisted session, but concurrency needs an integration test.** Unit-test prompt qualification, title sanitation, config merge/validation, stale-session checks, and rejection handling by extracting them into pure functions and injecting the title generator. SDK tests can use `DefaultResourceLoader({ extensionFactories: [...] })`, `SessionManager.inMemory()`, and `SettingsManager.inMemory()`. Integration tests should load with `-e` or an additional extension path and verify: initial blank session gets one title; named/resumed sessions do not; active agent output begins before delayed title generation completes; `/name` during generation wins; switch/new/shutdown cancels or discards stale work; missing auth/model and malformed config do not affect the active session. [SDK extension example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/06-extensions.ts) [SDK settings example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/10-settings.ts)

10. **Follow-up/out of scope: commands can persist settings for later sessions.** `pi.registerCommand(name, { description, handler })` exposes slash commands, and command handlers can use Node filesystem APIs to update a dedicated extension config. Pi also demonstrates `SettingsList` for a settings UI. Therefore `/prompt-title-model`, `/prompt-title on|off`, etc. are feasible and can persist globally/project-locally for later sessions. However, safe persistence requires schema validation, project-trust/scope UX, atomic writes, preservation of unknown keys, and error reporting; this is explicitly **follow-up and out of scope for the initial spec**, which should read existing config only. `pi.appendEntry()` persists only within the current session and is not a cross-session settings store. [Command API](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) [TUI settings pattern](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/tui.md)

## Product-requirement implications

| Requirement | Settled implementation seam | Constraint / decision |
|---|---|---|
| Detect first substantive prompt | `session_start` + branch inspection + latched `before_agent_start` | Product must define “substantive”; expansion-aware event is preferred. |
| Invoke selected title model | `modelRegistry.find` → `getApiKeyAndHeaders` → `complete` | Do not switch the active model; missing model/auth is non-fatal. |
| Do not block active session | Fire-and-observe detached promise; own abort controller | Event handlers are awaited; no managed background-task API exists. |
| Respect manual names | `getSessionName` before launch and before apply; observe `session_info_changed` | Provenance is unavailable, so preserve every existing name. |
| Apply title safely | Sanitize then `setSessionName` after session/name re-check | No documented max length and no atomic compare-and-set. |
| Read configuration | Dedicated JSON via `getAgentDir`, `CONFIG_DIR_NAME`, `cwd`; gate project config on trust | No arbitrary extension-settings API in context. |
| Log diagnostics | Namespaced `console.warn/error`; optional guarded `ui.notify` | No structured logger; never log secrets/full prompts. |
| Install/test | `-e`, extension directories, or Pi package; SDK in-memory facilities | Add concurrency/session-replacement integration coverage. |
| Persist settings via commands | Technically supported with `registerCommand` + filesystem/UI | **Follow-up/out of scope for initial spec.** |

## Recommended minimal lifecycle sketch

```ts
export default function (pi: ExtensionAPI) {
  let armed = false;
  let launched = false;
  let controller: AbortController | undefined;
  let sessionId: string | undefined;

  pi.on("session_start", (_event, ctx) => {
    sessionId = ctx.sessionManager.getSessionId();
    launched = false;
    armed = !ctx.sessionManager.getBranch().some(
      e => e.type === "message" && e.message.role === "user",
    );
  });

  pi.on("before_agent_start", (event, ctx) => {
    if (!armed || launched || !event.prompt.trim() || pi.getSessionName()) return;
    launched = true; // latch before starting async work
    const expectedSessionId = sessionId;
    const prompt = event.prompt;
    controller = new AbortController();

    void generateTitle(prompt, ctx.modelRegistry, controller.signal)
      .then(title => {
        if (!title || controller?.signal.aborted) return;
        if (ctx.sessionManager.getSessionId() !== expectedSessionId) return;
        if (pi.getSessionName()) return;
        pi.setSessionName(sanitize(title));
      })
      .catch(err => console.warn("[prompt-title] title generation failed", safeError(err)));
  });

  pi.on("session_shutdown", () => controller?.abort());
}
```

This is illustrative rather than copy-ready: production code should avoid retaining stale session-bound context across replacement, capture only plain identifiers/config, and arrange the final apply operation through state known to still belong to the active extension instance.

## Sources

- **Kept:** [Pi extension documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) — canonical lifecycle, exact extension methods/events, context, commands, naming, and mode behavior.
- **Kept:** [Installed extension type declarations](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/types.ts) — exact event and API types; local installed package was `@earendil-works/pi-coding-agent` 0.80.10.
- **Kept:** [Session format](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md) — persisted name/custom entries and branch inspection.
- **Kept:** [Q&A example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/qna.ts) and [handoff example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/handoff.ts) — direct selected-model invocation with auth, headers, env, and abort signal.
- **Kept:** [Preset example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/preset.ts) — official dedicated global/project config-loading pattern.
- **Kept:** [SDK docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md) — in-memory testing and settings/runtime behavior.
- **Kept:** [Packages docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md) — installation/distribution contract.
- **Dropped:** Third-party articles and GitHub issues — unnecessary because installed docs, declarations, and official examples directly answer the question.

## Gaps and residual uncertainties

- Pi provides no name provenance, atomic “set only if unnamed,” documented name-length limit, extension logger, managed background-task API, or arbitrary extension-settings accessor.
- The detached task/session-replacement interaction needs a real integration test; the public docs warn that old extension contexts become stale, but do not provide a background completion handoff primitive.
- “Substantive prompt,” image-only behavior, title maximum length, title-model fallback, and whether to retry after generation failure are product policies, not Pi API facts.
- Direct `complete()` usage creates separate model cost/usage that is not naturally represented in active-session usage totals.
