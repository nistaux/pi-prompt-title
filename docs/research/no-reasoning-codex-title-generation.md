# Research: Verify no-reasoning Codex title generation

## Summary

**Yes.** Pi 0.80.10 can invoke `openai-codex/gpt-5.4-mini` on the ChatGPT OAuth backend with reasoning explicitly disabled. In a Pi extension, the supported current path is the full (non-simple) compatibility `complete()` imported explicitly from `@earendil-works/pi-ai/compat`, passing the provider option `reasoningEffort: "none"`. It emits `reasoning: { effort: "none", summary: "auto" }`; a live authenticated probe succeeded with `usage.reasoning === 0` and no thinking content.

Do **not** use `completeSimple(..., { reasoning: "off" })`: `"off"` is not in the public simple-option type, and the Codex adapter maps a forced `off` to `undefined`, omitting the reasoning object. Do **not** pass `reasoningSummary: "off"` on the OAuth backend: the live probe showed that backend rejects it. Omit the summary option and rely on explicit `reasoningEffort: "none"`.

## Answer

The implementation-ready specification should require:

```ts
import { complete } from "@earendil-works/pi-ai/compat";

const response = await complete(
  model,
  { systemPrompt, messages },
  {
    apiKey: auth.apiKey,
    headers: auth.headers,
    env: auth.env,
    signal,
    reasoningEffort: "none",
  },
);
```

The extension must first resolve exactly `openai-codex/gpt-5.4-mini` with `ctx.modelRegistry.find(...)`, verify `model.api === "openai-codex-responses"`, and obtain OAuth request material through `ctx.modelRegistry.getApiKeyAndHeaders(model)`.

If explicit `none` fails, title generation fails silently in the normal UI. The extension must not retry with `low`, omit the reasoning effort, switch providers, or use the active session model.

## Evidence

### Provider-specific `none` is public and serialized explicitly

`OpenAICodexResponsesOptions` publicly declares `reasoningEffort?: "none" | "minimal" | "low" | ...`. The adapter maps `"none"` through `model.thinkingLevelMap?.off ?? "none"` and, when the result is supported, emits a `reasoning` object containing that effort. For the installed `gpt-5.4-mini` catalog entry there is no contrary `off` mapping, so the wire value is exactly `none`.

- Installed declaration: `@earendil-works/pi-ai/dist/api/openai-codex-responses.d.ts:3-10`
- Installed implementation: `@earendil-works/pi-ai/dist/api/openai-codex-responses.js:340-378`
- [Upstream Codex adapter at the researched revision](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/ai/src/api/openai-codex-responses.ts)
- [Pi AI provider-specific reasoning documentation](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/ai/README.md#provider-specific-options-streamcomplete)

OpenAI’s GPT-5.4 mini API model page also lists `none` as a supported reasoning effort. That page describes the public API, not the separate ChatGPT backend, so the live probe below supplies the backend-specific evidence. [OpenAI GPT-5.4 mini model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini)

### The simple path cannot enforce disabled reasoning

`SimpleStreamOptions.reasoning` is typed as `ThinkingLevel`, which starts at `minimal`; it does not accept `off`. The Codex `streamSimple` implementation nevertheless handles a runtime `off` value by converting it to `undefined`, after which the full adapter omits the reasoning object. Omission delegates behavior to a backend default and does not satisfy an explicit no-reasoning contract.

- Installed types: `@earendil-works/pi-ai/dist/types.d.ts:22-24,213-217`
- Installed implementation: `@earendil-works/pi-ai/dist/api/openai-codex-responses.js:324-335`
- [Upstream Pi AI types](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/ai/src/types.ts)

### Why an extension should use full `complete()` today

Pi’s official Q&A and handoff extension examples import `complete` explicitly from `@earendil-works/pi-ai/compat`, resolve credentials through `ctx.modelRegistry`, and make an independent completion without switching the active model. The extension loader also maps the extension-visible `@earendil-works/pi-ai` root to that compatibility entrypoint, but ordinary consumers of the package root do not receive `complete`; using the explicit `/compat` import avoids relying on that loader-only alias distinction.

The Pi AI library separately documents direct API modules such as `@earendil-works/pi-ai/api/openai-codex-responses`, but Pi 0.80.10’s extension loader only provides explicit aliases/virtual modules for the root, `compat`, `oauth`, and `providers/all`. In a single-file extension probe, the direct subpath was incorrectly resolved beneath `dist/compat.js` and failed to load. Therefore the direct API module is not a portable extension import in this Pi release even though it is public to ordinary Pi AI consumers.

- [Official Q&A extension example](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/coding-agent/examples/extensions/qna.ts)
- [Official handoff extension example](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/coding-agent/examples/extensions/handoff.ts)
- Installed extension loader: `@earendil-works/pi-coding-agent/dist/core/extensions/loader.js:10-48,64-107`
- [Upstream extension loader at the researched revision](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/coding-agent/src/core/extensions/loader.ts)
- [Pi extension available-import documentation](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/coding-agent/docs/extensions.md#available-imports)

The root compatibility API is explicitly transitional in Pi AI’s documentation. The specification should therefore pin a compatible Pi version and tests should detect a future API migration. When Pi exposes provider-owned `Models` or direct API subpaths to extension code, the implementation can migrate without changing the product contract: the invariant is the explicit `reasoning.effort: "none"` request, not the compatibility dispatcher itself.

## Live OAuth verification

Three credential-safe probe configurations were run through a temporary extension loaded by Pi 0.80.10: direct-adapter calls with and without `reasoningSummary: "off"`, followed by the recommended explicit `@earendil-works/pi-ai/compat` path without that summary option. All used the installed model registry and existing `openai-codex` OAuth authentication. The probes printed only model identity, the reasoning payload, response status, usage counts, content block types, and generated title; no bearer token, headers, or credential files were printed.

### Rejected combination

With `reasoningEffort: "none"` and `reasoningSummary: "off"`, Pi emitted:

```json
{"effort":"none","summary":"off"}
```

The ChatGPT backend rejected the request:

```text
Invalid value: 'off'. Supported values are: 'concise', 'detailed', and 'auto'.
```

Although Pi’s provider-specific TypeScript type includes `off`, it is not accepted by this OAuth backend. The specification must not require it.

### Successful explicit-none request

With `reasoningEffort: "none"` and no `reasoningSummary` option, the extension-visible full `complete()` path emitted and successfully executed:

```json
{
  "provider": "openai-codex",
  "model": "gpt-5.4-mini",
  "api": "openai-codex-responses",
  "baseUrl": "https://chatgpt.com/backend-api",
  "observedReasoning": { "effort": "none", "summary": "auto" },
  "stopReason": "stop",
  "usageReasoning": 0,
  "contentTypes": ["text"],
  "text": "OAuth Refresh Testing"
}
```

The direct adapter and the recommended explicit `/compat` completion path each succeeded with the same explicit effort and zero reasoning-token result. The retained temporary probe uses the recommended `/compat` import. Together these runs establish that the current ChatGPT OAuth backend accepts explicit `none` for the selected model and that Pi reports no reasoning work for the request.

## Integration-test contract

Add three tests around the same title-generation adapter.

### Offline payload regression test

- Resolve or fixture a model with exact identity `openai-codex/gpt-5.4-mini` and API `openai-codex-responses`.
- Invoke the full completion path with `reasoningEffort: "none"`.
- Capture the provider payload with `onPayload`, then throw a test sentinel from that callback so the adapter cannot reach the network.
- Assert the sentinel produces the expected local error result and `payload.reasoning.effort === "none"`.
- Assert the reasoning object is present and its effort is neither omitted nor `low`.
- Do not require `reasoningSummary: "off"`; for Pi 0.80.10 the adapter’s emitted summary is `auto`.

### Credential-gated live OAuth test

- Keep the test outside the default offline suite and skip clearly when `openai-codex` OAuth auth or the exact model is unavailable.
- Use the real Pi model registry and existing credential store without printing credentials.
- Assert exact provider, model, API, and ChatGPT backend identity before sending.
- Send a minimal deterministic prompt, no tools, an abort timeout, and `reasoningEffort: "none"` through the same extension-visible full `complete()` path used in production.
- Capture the outgoing payload and require explicit `reasoning.effort === "none"`.
- Require `stopReason === "stop"`, non-empty text, no `thinking` content blocks, and `response.usage.reasoning === 0`.
- Treat backend rejection, omitted reasoning telemetry, nonzero reasoning usage, or payload omission as test failure. Distinguish missing auth (skip) and transient network/quota failure (environmental/inconclusive) from a contract failure.
- Never retry with `low` or an omitted effort.

Add a separate adapter-level failure test whose injected completion rejects explicit `none`. Assert one attempt, the exact configured provider/model/effort, no alternate completion call, no title application, and no normal-UI error. This enforces the no-fallback and silent-failure contract rather than merely documenting it.

The live test proves backend acceptance and observed zero reasoning usage; the offline tests catch request serialization and failure-policy regressions without credentials.

## Decision implications

- Strict no-reasoning generation is supported for `openai-codex/gpt-5.4-mini` on the tested Pi 0.80.10 ChatGPT OAuth path.
- The specification must say `reasoningEffort: "none"`, not generic `reasoning: "off"`.
- The specification must omit `reasoningSummary: "off"` because the OAuth backend rejects it.
- Current extension code should use explicit `complete()` from `@earendil-works/pi-ai/compat` with credentials from `ModelRegistry`; direct Pi AI API subpaths are not portable through Pi 0.80.10’s extension loader.
- Explicit-none failure is a silent title-generation failure, never permission to fall back to `low`, omission, another provider, or another model.
- The credential-gated integration test is a release gate for the no-reasoning claim and a migration alarm for future Pi API changes.

## Version and residual risk

The installed and live-tested runtime was `@earendil-works/pi-coding-agent` 0.80.10 with its bundled `@earendil-works/pi-ai` 0.80.10 at upstream revision `3da591ab74ab9ab407e72ed882600b2c851fae21`.

The result proves the tested account/runtime/backend combination, not permanent support across every account tier, rollout cohort, region, or future backend revision. That is why the live integration test remains necessary. The compatibility `complete()` export is also planned for eventual removal; version pinning and the same payload/backend assertions make that migration explicit rather than silently weakening the no-reasoning contract.
