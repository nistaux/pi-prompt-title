# Title-quality prototype findings

The title-quality harness was throwaway research code, not production extension code. It exercised `openai-codex/gpt-5.4-mini` through the `openai-codex-responses` path with explicit no-reasoning generation. Each simulated session made one attempt using only the fixed title instruction and a whitespace-aware excerpt of at most 1,000 Unicode code points.

The final reliability pass ran the 12 representative fixtures three times each:

- 36/36 calls completed and passed format validation.
- 17/27 required exact-identifier observations retained the identifier.
- 39/39 forbidden-detail observations excluded the unwanted detail.
- Successful-call latency was 1,536 ms average, 1,142 ms median, and 4,080 ms p95.

The prototype established a useful instruction and validation baseline, but it also showed that prompt wording alone could not reliably preserve every exact identifier. [Choose deterministic exact-identifier assistance](https://github.com/nistaux/pi-prompt-title/issues/15) subsequently made identifier preservation best-effort in favor of readable hard limits. The authoritative implementation contract in [Implement automatic asynchronous Pi session titles](https://github.com/nistaux/pi-prompt-title/issues/16) supersedes the prototype.

## Durable references

- [Prototype resolution and full findings](https://github.com/nistaux/pi-prompt-title/issues/7)
- [Exact-identifier decision](https://github.com/nistaux/pi-prompt-title/issues/15)
- [Authoritative implementation contract](https://github.com/nistaux/pi-prompt-title/issues/16)
- [Representative fixtures](./title-quality-fixtures.json)
- [Immutable prototype evidence commit](https://github.com/nistaux/pi-prompt-title/tree/e966f9a90cd12cfc5422bfb8c5f0bc8c77d5aee2/prototype/title-quality)
