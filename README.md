# Pi Prompt Title

Pi Prompt Title is an installable extension for [Pi](https://github.com/earendil-works/pi). It loads a strict, trust-aware title-generation configuration snapshot for each session. For an enabled, fresh, unnamed session, the default runtime consumes the first expanded prompt containing non-whitespace text and starts one detached title-model attempt without delaying the active response. A valid result becomes the session title; whitespace-only and image-only input leave the session armed.

This is a narrow lifecycle milestone rather than the complete release contract. Actionable startup warnings remain tracked by [Show only actionable startup warnings](https://github.com/nistaux/pi-prompt-title/issues/24), and the complete user-facing contract remains tracked by [Document the user-facing extension contract](https://github.com/nistaux/pi-prompt-title/issues/27).

## Compatibility

This package is verified against Pi **0.80.10**. Compatibility with earlier Pi versions has not been tested or claimed.

## Installation

Install directly from Git:

```sh
pi install git:github.com/nistaux/pi-prompt-title
```

For local development, install the checkout by path:

```sh
pi install ./path/to/pi-prompt-title
```

To load the extension directly for one run without changing Pi package settings:

```sh
pi -e ./path/to/pi-prompt-title/src/index.ts
```

Pi packages and extensions execute with the user's full system permissions. Review third-party source before installing it.

## Configuration

Each `session_start` loads one deeply immutable snapshot from these layers, in increasing precedence:

1. built-in defaults;
2. `~/.pi/agent/pi-prompt-title.json` (using Pi's active agent directory); and
3. Pi's active project configuration directory—normally `<project>/.pi/pi-prompt-title.json`—only for a trusted project. Rebranded Pi distributions use their configured directory name instead of `.pi`.

The defaults are:

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

A file may contain `enabled`, `model`, and/or `timeoutMs`. Top-level fields merge independently, but `model` is one atomic pair and must contain both a non-empty `provider` and non-empty `id`. Identifiers are preserved exactly. `enabled` must be a boolean, and `timeoutMs` must be an integer from 1,000 through 60,000 inclusive. Unknown properties, malformed JSON, or any invalid field reject that whole file while retaining lower-precedence layers. Missing files are normal; other read or validation failures are retained only as sanitized diagnostic state for later warning support.

Changes take effect on `/reload` or a session transition, not within an active session snapshot. Effective `enabled: false` leaves the extension completely inert after configuration loading: it performs no model lookup, credential check, warning, prompt capture, timer, or generation work.

## Isolated title-model attempt

The exported attempt resolves only the configured exact provider/model through Pi's registry, resolves credentials at call time, and makes at most one full compatibility completion. One timeout covers credential resolution and completion through an attempt-owned abort signal. The completion uses explicit `reasoningEffort: "none"`, no tools, the fixed title instruction, and one whitespace-aware excerpt bounded to 1,000 Unicode code points. It returns only locally validated output; missing models or credentials, timeout, provider failure, and invalid output all return no title without retry, fallback, or diagnostics.

The default runtime invokes this operation once for the first qualifying expanded substantive prompt of an eligible session. It launches the promise without awaiting title generation from `before_agent_start`, consumes eligibility before fallible asynchronous work, and sets only a valid returned title. Runtime teardown, session replacement, session-tree navigation, and any non-empty title appearing before application permanently invalidate the operation and abort it when possible. Immediately before writing, the runtime rechecks runtime, session, branch, operation, and empty-title state. Clearing a manual title does not rearm generation, while response aborts, compaction, model or thinking changes, tools, and later messages leave otherwise-current title work alone. Pi exposes no atomic set-if-unnamed operation or title provenance, so protection against a title written in the final read/write interval is necessarily best-effort. The runtime does not switch the active model or thinking level, append messages, or mutate active-session context.

## Development

Install the locked development dependencies:

```sh
npm ci
```

The validation commands are deterministic and require neither model credentials nor network access after dependencies are installed:

```sh
npm test             # offline unit tests
npm run typecheck    # strict TypeScript checking
npm run smoke        # isolated local-path install and Pi 0.80.10 discovery/load
npm run check        # all of the above
npm pack --dry-run   # inspect package contents
```

The smoke command creates a clean-style temporary package copy and isolated Pi agent directory, runs Pi's documented local-path installation with startup networking disabled, loads the manifest-addressed extension through `DefaultResourceLoader`, verifies its configuration and one-shot title lifecycle handlers and absence of tools or commands, and removes the temporary files. It does not modify the user's Pi settings.

## Research

- [Pi extension seams](https://github.com/nistaux/pi-prompt-title/blob/main/docs/research/pi-extension-seams.md) records the verified Pi lifecycle, model, configuration, diagnostics, installation, and testing boundaries.
- [Title-quality prototype findings](https://github.com/nistaux/pi-prompt-title/blob/main/docs/research/title-quality-prototype.md) preserves the durable conclusions from the throwaway prototype.
- [Representative title-quality fixtures](https://github.com/nistaux/pi-prompt-title/blob/main/docs/research/title-quality-fixtures.json) are retained for later implementation and release validation.
