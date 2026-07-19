# Pi Prompt Title

Pi Prompt Title is an installable extension for [Pi](https://github.com/earendil-works/pi) that derives a concise session title from the first qualifying expanded substantive prompt in a fresh, unnamed session. It starts one separate title-generation attempt without delaying the active agent response or adding title-generation material to the active session context.

The opportunity is one-shot. If model lookup, authentication, generation, validation, or safe application fails, the extension does not apply a generated title and does not retry or fall back.

## Compatibility

The package's installation, loading, and lifecycle integration have been verified against **Pi 0.80.10**. Compatibility with earlier or later Pi versions has not been tested or claimed. The package requires Node.js 22.19.0 or later.

## Installation

Install the package from Git with the canonical command verified against Pi 0.80.10:

```sh
pi install git:github.com/nistaux/pi-prompt-title
```

For local development, install a checkout by path:

```sh
pi install ./path/to/pi-prompt-title
```

To load the extension directly for one run without changing Pi package settings:

```sh
pi -e ./path/to/pi-prompt-title/src/index.ts
```

Pi packages and extensions execute with the user's full system permissions. Review third-party source before installing it.

## Configuration and authentication

Each `session_start` loads one immutable configuration snapshot from these layers, in increasing precedence:

1. built-in defaults;
2. `~/.pi/agent/pi-prompt-title.json`, using Pi's active agent directory; and
3. Pi's active project configuration directory—normally `<project>/.pi/pi-prompt-title.json`—only when Pi considers the project trusted.

Rebranded Pi distributions use their configured agent and project-directory names rather than necessarily using `.pi`.

The built-in configuration is:

```json
{
  "enabled": true,
  "model": {
    "provider": "openai-codex",
    "id": "gpt-5.4-mini"
  },
  "timeoutMs": 10000
}
```

A configuration file may contain only `enabled`, `model`, and `timeoutMs`:

- `enabled` must be a boolean.
- `timeoutMs` must be an integer from 1,000 through 60,000 milliseconds inclusive.
- `model` is an atomic identity pair. When present, it must contain exactly a non-empty string `provider` and a non-empty string `id`; the complete pair replaces the lower-precedence pair.
- Provider and model identifiers are preserved exactly for registry lookup. They are not normalized, aliased, or inferred.
- Unknown properties, malformed JSON, unreadable files, or any invalid value reject that whole file. Lower-precedence configuration remains effective.
- Missing configuration files are normal and leave lower layers in effect.

Top-level fields merge independently across valid files. Changes take effect after `/reload` or a session transition, when a new snapshot is loaded; they do not alter the active session's snapshot. Effective `enabled: false` makes the extension inert: it performs no title-model lookup, credential check, warning, prompt capture, timer, or generation work.

The configured exact provider/model must already exist in Pi's model registry and be usable with credentials available through that provider. The default `openai-codex/gpt-5.4-mini` uses Pi's ChatGPT/Codex subscription authentication surface and the `openai-codex-responses` API path. The extension never substitutes the active model or falls back to another model, provider, authentication mechanism, or billing boundary.

At enabled startup, the extension performs exact-model lookup and launches a credential preflight only to determine warning state. It does not make a model request or consume the session's title opportunity. Credential resolution is independently bounded by `timeoutMs`, and startup does not wait for this preflight to finish. When a qualifying prompt later consumes the opportunity, the extension resolves the model and credentials again because availability may have changed. That separate one-shot attempt has its own `timeoutMs` budget covering credential resolution and the model request.

## Privacy and cost boundary

The title model receives exactly two pieces of model content:

1. the extension-authored fixed title instruction; and
2. one bounded text excerpt from the first qualifying expanded **substantive prompt**.

Only the excerpt is user-derived content. Before the request, the extension trims leading and trailing whitespace and counts Unicode code points rather than UTF-16 code units. If the result exceeds 1,000 code points, it inspects the first 1,000 and cuts immediately before the last whitespace code point at or before that boundary. If there is no whitespace in those first 1,000 code points, it hard-cuts at 1,000. Internal whitespace is otherwise preserved.

The model content does **not** include images, session history, later messages, Pi's active system prompt or context files, tool output, session metadata, the working directory or other project context, credentials, or headers. Credentials, headers, and provider environment values are used only as request transport material. Prompt text, generated text, credentials, headers, and configuration-file contents are not written to extension warnings or diagnostics.

Generation is a separate asynchronous provider attempt. It may consume provider subscription allowance or incur provider cost even though it does not use the active agent's context window. The startup credential preflight is not a generation request.

## Eligibility and lifecycle

A session is eligible only when it starts as a fresh startup/new session, its active branch has no prior user message, and it has no title. A non-empty title observed before generation launches permanently disqualifies the session; clearing it later does not rearm the opportunity.

A **substantive prompt** expresses an actual task or topic rather than session administration. Operationally, the extension selects the first `before_agent_start` event whose expanded text contains any non-whitespace character; it does not add a separate semantic classifier:

- Pi-handled extension commands do not reach that event and do not qualify.
- Skill and prompt-template expansion is included.
- Whitespace-only and image-only input does not qualify, so the session remains armed.
- Messages injected with Pi's user-message API qualify because Pi presents them through the same event without source provenance.

The extension synchronously consumes eligibility before starting fallible asynchronous work, preventing queued or concurrent prompts from launching duplicates. A session therefore has one opportunity and **at most one actual title-model invocation**: lookup or credential failure can consume the opportunity before any model request is sent.

Generation is detached from Pi's active response. The lifecycle handler does not await it, and the extension does not switch the active model or thinking level, append session messages, or otherwise mutate active-agent context. Aborting the main response, compaction, model or thinking changes, tool activity, and later messages do not cancel otherwise-current title work.

The extension aborts when possible and always discards late output after reload or shutdown, session replacement/resume/fork, active-branch navigation, or a non-empty title appearing while work is pending. Returning to an earlier session or branch, clearing a disqualifying title, or any normal generation failure does not retry or rearm the opportunity. Detached work is best-effort asynchronous work within the running Pi process; no stronger process-durability guarantee is made.

## Title contract and limitations

The title instruction asks for a concrete, glanceable description of the primary requested outcome or topic. It prefers three to five whitespace-separated words and 15–30 Unicode code points, but naturally complete one- or two-word titles are allowed. The hard limits are one to seven words and no more than 40 Unicode code points.

A result is accepted only after local format validation. The completion must stop normally and contain text blocks only. The extension joins those blocks, trims outer whitespace, and collapses runs of ASCII spaces or tabs. It rejects empty, multiline, control-character, whole-output Markdown strong/strikethrough/inline-code wrappers, Markdown bullet/heading/blockquote forms, whole-output Markdown links or images, matching-quotation-wrapped, title-prefixed, non-text, non-stop, over-seven-word, or over-40-code-point output.

Invalid output is never truncated, unwrapped, repaired, rewritten, or retried. Exact identifiers naming the target are requested only on a best-effort basis when compatible with readability and the hard limits. Long identifiers may be shortened or paraphrased, and occasional exact-identifier omission is an accepted quality limitation rather than a runtime failure.

Before applying a valid result, the extension rechecks that the originating runtime, session, branch, operation, and unnamed state are still current. A manual title present before the final check is preserved, and a later manual rename supersedes a generated title. Pi exposes neither title provenance nor an atomic set-if-unnamed operation, so manual-title precedence is best-effort: an unavoidable narrow race remains between the final empty-name check and the synchronous `setSessionName()` call.

## Diagnostics

Only actionable startup problems are user-visible: an invalid global or trusted-project configuration file, an unavailable exact provider/model, or unavailable authentication. Interactive TUI mode shows concise warning-colored text above the editor, outside the transcript and model context. RPC, JSON, and print modes remain silent.

Warnings identify only the affected file/field or exact provider/model as appropriate. They do not expose file contents, prompt text, generated text, credentials, headers, or underlying provider errors. A successful generation-time model and authentication resolution clears or suppresses a stale startup model/authentication warning while retaining any applicable configuration warning.

After the title opportunity begins, timeout, provider/API error, explicit-no-reasoning rejection, cancellation, stale completion, and unusable output are normal silent failures. The extension applies no generated title and emits no widget, notification, transcript entry, or console warning.

## Scope

Interactive model switching and configuration-writing UI are not included; they are tracked by [Add interactive title-model switching in a later release](https://github.com/nistaux/pi-prompt-title/issues/1). This repository does not claim npm publication, release automation, CI support, or compatibility beyond the Pi 0.80.10 surfaces described above.

## Development and deterministic validation

Install the locked development dependencies:

```sh
npm ci
```

After dependencies are installed, all commands below are deterministic, credential-free, and network-free:

```sh
npm test                    # complete offline unit and lifecycle-runner integration suite
npm run test:unit           # focused configuration, lifecycle, and package unit suite
npm run test:integration    # focused Pi 0.80.10 lifecycle-runner integration
npm run typecheck           # strict TypeScript checking without emitting files
npm run verify:package      # verify exact package files, metadata, and bundling boundary
npm run smoke               # isolated direct load, local install, and manifest discovery
npm run check               # typecheck, complete tests, package verification, and smoke
```

The smoke command creates a candidate from tracked Git content, uses isolated Pi agent directories with startup networking disabled, directly loads `src/index.ts`, runs Pi's local-path installation, loads the manifest-addressed extension through `DefaultResourceLoader`, verifies its lifecycle handlers and absence of tools or commands, and removes temporary files. It does not modify the user's Pi settings. The lifecycle-runner integration uses Pi 0.80.10's real extension loading, binding, and dispatch with an in-memory session manager and no provider call.

The canonical Git installation is a separate **networked post-merge gate**, not part of the deterministic offline suite and not replaceable by the local-path smoke. [Prove clean distribution and SDK compatibility](https://github.com/nistaux/pi-prompt-title/issues/25) records the historical gate evidence for verified commit `bef41c93c95e47d0cf2ba34cc0643a4ab2a68b6f`: the canonical command installed and discovered the extension successfully with Pi 0.80.10 in an isolated credential-free agent directory.

Contributors preparing a release can run the separate credential-gated `npm run validate:oauth` and `npm run validate:quality` checks. Both live commands require Pi 0.80.10, stored ChatGPT OAuth authentication for exact `openai-codex/gpt-5.4-mini`, network access, and available provider quota or allowance. After a complete quality run, commit the machine report before a human edits only its 36 embedded judgments and rationales and runs the offline, no-model, no-network `npm run validate:review` finalizer. The finalizer verifies that all machine evidence still matches the first committed report; it is not an LLM judge. After committing failed or stale evidence for history, `npm run validate:reset` prepares the report for both fresh gates against a new candidate. These commands remain outside `npm test` and `npm run check`.

The tracked [release-validation report](docs/validation/release-validation.md) defines the sanitized schema and the result taxonomy: `pass`, `fail`, `skip`, and `environmental/inconclusive`. Missing authentication is a sanitized skip, while transient network, quota, or provider failures may be environmental/inconclusive. Neither classification satisfies the release gate.

## Research

- [Pi extension seams](https://github.com/nistaux/pi-prompt-title/blob/main/docs/research/pi-extension-seams.md) records the verified Pi lifecycle, model, configuration, diagnostics, installation, and testing boundaries.
- [Title-quality prototype findings](https://github.com/nistaux/pi-prompt-title/blob/main/docs/research/title-quality-prototype.md) preserves the durable conclusions from the throwaway prototype.
- [Representative title-quality fixtures](https://github.com/nistaux/pi-prompt-title/blob/main/docs/research/title-quality-fixtures.json) are retained for later release validation.
