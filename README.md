# Pi Prompt Title

Pi Prompt Title is an installable extension foundation for [Pi](https://github.com/earendil-works/pi). The current package is intentionally a no-op: it can be discovered and loaded, but it does not yet read prompts or configuration, call a model, create timers, show UI, or change a session title.

Automatic asynchronous session titles are being implemented in follow-up work tracked by [Implement automatic asynchronous Pi session titles](https://github.com/nistaux/pi-prompt-title/issues/16).

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

The smoke command creates a clean-style temporary package copy and isolated Pi agent directory, runs Pi's documented local-path installation with startup networking disabled, loads the manifest-addressed extension through `DefaultResourceLoader`, verifies that it registered no effects, and removes the temporary files. It does not modify the user's Pi settings.

## Research

- [Pi extension seams](https://github.com/nistaux/pi-prompt-title/blob/main/docs/research/pi-extension-seams.md) records the verified Pi lifecycle, model, configuration, diagnostics, installation, and testing boundaries.
- [Title-quality prototype findings](https://github.com/nistaux/pi-prompt-title/blob/main/docs/research/title-quality-prototype.md) preserves the durable conclusions from the throwaway prototype.
- [Representative title-quality fixtures](https://github.com/nistaux/pi-prompt-title/blob/main/docs/research/title-quality-fixtures.json) are retained for later implementation and release validation.
