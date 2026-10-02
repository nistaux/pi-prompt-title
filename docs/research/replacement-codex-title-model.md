# Replacement Codex title model

## Decision

Replace the built-in title model `openai-codex/gpt-5.4-mini` with `openai-codex/gpt-6-luna` when moving the extension compatibility target from Pi 0.80.10 to Pi 1.0.0.

The exact-model, ChatGPT OAuth, explicit-no-reasoning, one-shot, and no-fallback boundaries remain unchanged.

## Local runtime evidence

The installed runtime reports Pi 1.0.0. Its `openai-codex` catalog does not contain `gpt-5.4-mini`, so exact lookup produces the user-visible `model-unavailable` warning before authentication or generation can run:

```text
$ pi --version
1.0.0

$ pi --list-models openai-codex | grep gpt-5.4-mini
# no match; exit 1
```

The same catalog contains `openai-codex/gpt-6-luna`. Its bundled metadata uses the `openai-codex-responses` API and maps thinking level `off` to provider reasoning effort `none`. A credentialed, no-session probe against the installed Pi runtime completed successfully:

```text
$ pi --print --no-session --model openai-codex/gpt-6-luna --thinking off \
    "Return exactly this text and nothing else: Title model ready"
Title model ready
```

No credentials, headers, or token contents were printed or retained.

## Primary-source evidence

- [Pi v0.87.1 release notes](https://github.com/earendil-works/pi/releases/tag/v0.87.1) state that Pi added GPT-6 Sol and GPT-6 Luna support for both OpenAI API keys and OpenAI Codex subscriptions. Pi 1.0.0 retains that catalog entry.
- [OpenAI's GPT-6 Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna) describes Luna as its most efficient model for focused, high-volume tasks, lists `none` among the supported reasoning efforts, and publishes lower API token rates than the larger alternatives. API pricing does not establish ChatGPT subscription allowance; Pi's release notes and the successful local OAuth-backed probe establish the subscription route used here.
- The installed Pi 1.0.0 catalog is the authoritative source for extension lookup behavior on the user's machine: it contains `openai-codex/gpt-6-luna` and omits `openai-codex/gpt-5.4-mini`.

## Consequences

- Existing users can restore generation immediately with `~/.pi/agent/pi-prompt-title.json` selecting `openai-codex/gpt-6-luna`, followed by `/reload` and a fresh unnamed session.
- The repository default and compatibility dependencies must move together to Pi 1.0.0; keeping the old 0.80.10 test catalog would make the new default appear unavailable in deterministic tests.
- Historical research and release-validation evidence for `gpt-5.4-mini` remain historical evidence. A release claiming the new default still requires a fresh preregistered OAuth and quality validation run for `gpt-6-luna`.
