# Pi Prompt Title

Pi Prompt Title is a planned extension for [Pi](https://github.com/earendil-works/pi) that will automatically give each new session a concise, meaningful terminal-tab title based on its initial substantive prompt.

Its promise is narrow: produce a glanceable title without consuming the active session's context window or delaying its response. It will send only a bounded excerpt of the opening task to a small, inexpensive, token-efficient model in one asynchronous attempt, adding minimal cost and latency while making sessions easier to scan and revisit.

## Project status

The extension is not implemented or shipped yet. [Implement automatic asynchronous Pi session titles](https://github.com/nistaux/pi-prompt-title/issues/16) is the authoritative implementation contract and current work item.

## Research

- [Existing Pi session-title extensions](docs/research/existing-session-title-extensions.md) surveys prior art and the project's narrower differentiation.
- [Title-quality prototype findings](docs/research/title-quality-prototype.md) preserves the durable conclusions from the throwaway prototype.
- [Representative title-quality fixtures](docs/research/title-quality-fixtures.json) are retained for implementation and release validation.
