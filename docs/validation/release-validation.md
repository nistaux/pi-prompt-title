# Release validation

This tracked report contains only fixed synthetic-fixture titles and sanitized classifications. It must never contain credentials, authorization material, cookies, headers, environment values, or raw provider errors.

## Commands, prerequisites, and classification

- `npm run validate:oauth` runs one live OAuth probe.
- `npm run validate:quality` runs one fresh, complete set of 36 live quality attempts.
- `npm run validate:review` performs only offline recomputation after a human edits all 36 embedded JSON judgments and rationales; it makes no model or network call and is not an LLM judge.
- Live prerequisites: Pi 0.80.10, stored ChatGPT OAuth authentication for exact `openai-codex/gpt-5.4-mini`, network access, and available provider quota/allowance.
- Taxonomy: `pass`, `fail`, `skip`, and `environmental/inconclusive`. Missing authentication is `skip`; transient network/quota/provider failures may be `environmental/inconclusive`; neither satisfies the release gate.

## Run identity

- Generated at (UTC): `not-run`
- Tested commit: `not-run`
- Pi version: `0.80.10`
- Target: `openai-codex/gpt-5.4-mini`
- API: `openai-codex-responses`
- Authentication backend: ChatGPT OAuth

## OAuth probe

- Classification: **environmental/inconclusive**
- Sanitized diagnostic: `provider-request-failed`
- Payload/completion assertions: not available

## Representative quality run

- Classification: **environmental/inconclusive**
- Sanitized diagnostic: `human-review-pending`
- Attempts recorded: 0/36
- Hard validation: 0/36 (required 36)
- Preferred 15–30 code points: 0/36 (required at least 33)
- Forbidden-detail exclusion: 0/36 (required 36)
- Injection/token-fragment exclusion: 0/36 (required 36)
- Human semantic review: 0/36 reviewed with non-empty rationales; 0/36 passed (required at least 33)

## Human semantic-review procedure

A human reviewer must inspect all 36 generated titles against the corresponding retained fixture. In the embedded JSON below, set every `humanSemanticPassed` to `true` or `false` and every `humanRationale` to a non-empty short explanation stating whether the title is specific, glanceable, and descriptive of the primary requested outcome or topic. Then run `npm run validate:review` to validate and atomically rerender the report. Exact-identifier-only requirements are informational and excluded from the semantic threshold. Do not use an LLM judge, retry, replace, omit, repair, or selectively rerun an attempt. A pending judgment or rationale keeps the final gate environmental/inconclusive.

## Final release gate

**environmental/inconclusive**

<!-- release-validation-data:start -->
```json
{
  "generatedAtUtc": "not-run",
  "testedCommit": "not-run",
  "piVersion": "0.80.10",
  "target": {
    "provider": "openai-codex",
    "model": "gpt-5.4-mini",
    "api": "openai-codex-responses",
    "backend": "ChatGPT OAuth"
  },
  "oauth": {
    "classification": "environmental/inconclusive",
    "diagnostic": "provider-request-failed",
    "assertions": null
  },
  "quality": {
    "classification": "environmental/inconclusive",
    "diagnostic": "human-review-pending",
    "attempts": []
  },
  "conclusion": "environmental/inconclusive"
}
```
<!-- release-validation-data:end -->
