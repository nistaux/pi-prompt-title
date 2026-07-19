# Release validation

This tracked report contains only fixed synthetic-fixture titles and sanitized classifications. It must never contain credentials, authorization material, cookies, headers, environment values, or raw provider errors.

## Commands, prerequisites, and classification

- `npm run validate:oauth` runs one live OAuth probe.
- `npm run validate:quality` runs one fresh, complete set of 36 live quality attempts.
- `npm run validate:review` performs only offline recomputation after a human edits all 36 embedded JSON judgments and rationales; it makes no model or network call and is not an LLM judge.
- After committing failed or stale evidence for history, `npm run validate:reset` prepares this report for both fresh gates against a new candidate.
- Live prerequisites: Pi 0.80.10, stored ChatGPT OAuth authentication for exact `openai-codex/gpt-5.4-mini`, network access, and available provider quota/allowance.
- Taxonomy: `pass`, `fail`, `skip`, and `environmental/inconclusive`. Missing authentication is `skip`; transient network/quota/provider failures may be `environmental/inconclusive`; neither satisfies the release gate.

## Run identity

- Generated at (UTC): `2026-07-19T07:15:48.362Z`
- Tested commit: `90c42df610b0f230e3ebc750f17fd038966ee03f`
- Pi version: `0.80.10`
- Target: `openai-codex/gpt-5.4-mini`
- API: `openai-codex-responses`
- Authentication backend: ChatGPT OAuth

## OAuth probe

- Classification: **pass**
- Sanitized diagnostic: `none`
- Payload/completion assertions: `{"reasoningEffortNone":true,"normalStop":true,"nonEmptyTextOnly":true,"noThinkingBlocks":true,"reasoningTelemetryPresent":true,"zeroReasoningUsage":true,"productionTitleAccepted":true}`

## Representative quality run

- Classification: **fail**
- Sanitized diagnostic: `quality-threshold-failed`
- Attempts recorded: 36/36
- Hard validation: 35/36 (required 36)
- Preferred 15–30 code points: 28/36 (required at least 33)
- Forbidden-detail exclusion: 35/36 (required 36)
- Injection/token-fragment exclusion: 35/36 (required 36)
- Human semantic review: 0/36 reviewed with non-empty rationales; 0/36 passed (required at least 33)

## Human semantic-review procedure

A human reviewer must inspect all 36 generated titles against the corresponding retained fixture. In the embedded JSON below, set every `humanSemanticPassed` to `true` or `false` and every `humanRationale` to a non-empty short explanation stating whether the title is specific, glanceable, and descriptive of the primary requested outcome or topic. Then run `npm run validate:review` to validate and atomically rerender the report. Exact-identifier-only requirements are informational and excluded from the semantic threshold. Do not use an LLM judge, retry, replace, omit, repair, or selectively rerun an attempt. A pending judgment or rationale keeps the final gate environmental/inconclusive.

## Final release gate

**fail**

<!-- release-validation-data:start -->
```json
{
  "generatedAtUtc": "2026-07-19T07:15:48.362Z",
  "testedCommit": "90c42df610b0f230e3ebc750f17fd038966ee03f",
  "piVersion": "0.80.10",
  "target": {
    "provider": "openai-codex",
    "model": "gpt-5.4-mini",
    "api": "openai-codex-responses",
    "backend": "ChatGPT OAuth"
  },
  "oauth": {
    "classification": "pass",
    "diagnostic": null,
    "assertions": {
      "reasoningEffortNone": true,
      "normalStop": true,
      "nonEmptyTextOnly": true,
      "noThinkingBlocks": true,
      "reasoningTelemetryPresent": true,
      "zeroReasoningUsage": true,
      "productionTitleAccepted": true
    }
  },
  "quality": {
    "classification": "fail",
    "diagnostic": "quality-threshold-failed",
    "attempts": [
      {
        "fixtureId": "short-refactor",
        "repetition": 1,
        "generatedTitle": "Refactor Authentication",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 23,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "short-refactor",
        "repetition": 2,
        "generatedTitle": "Refactor Authentication",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 23,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "short-refactor",
        "repetition": 3,
        "generatedTitle": "Authentication Refactor",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 23,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "outcome-over-method",
        "repetition": 1,
        "generatedTitle": "Fix ModelRegistry OAuth Race",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 28,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "outcome-over-method",
        "repetition": 2,
        "generatedTitle": "Fix OAuth Refresh Race",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 22,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "outcome-over-method",
        "repetition": 3,
        "generatedTitle": "Fix ModelRegistry OAuth Refresh Race",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 36,
        "preferredLengthPassed": false,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "incidental-tool-file",
        "repetition": 1,
        "generatedTitle": "Update timeout validation",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 25,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "incidental-tool-file",
        "repetition": 2,
        "generatedTitle": "Update timeout validation",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 25,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "incidental-tool-file",
        "repetition": 3,
        "generatedTitle": "Update timeout validation",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 25,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "exact-model-identifier",
        "repetition": 1,
        "generatedTitle": "Investigate reasoning effort rejection",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 38,
        "preferredLengthPassed": false,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "exact-model-identifier",
        "repetition": 2,
        "generatedTitle": "Investigate reasoning effort rejection",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 38,
        "preferredLengthPassed": false,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "exact-model-identifier",
        "repetition": 3,
        "generatedTitle": "Investigate gpt-5.4-mini reasoning rejection",
        "classification": "fail",
        "hardValidationPassed": false,
        "codePointCount": null,
        "preferredLengthPassed": false,
        "forbiddenDetailsPassed": false,
        "injectionPassed": false,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "error-code-identifier",
        "repetition": 1,
        "generatedTitle": "Resolve TS2322 Error",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 20,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "error-code-identifier",
        "repetition": 2,
        "generatedTitle": "Resolve TS2322 error",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 20,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "error-code-identifier",
        "repetition": 3,
        "generatedTitle": "Resolve TS2322 Error",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 20,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "conversational-framing",
        "repetition": 1,
        "generatedTitle": "Fix double checkout charges",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 27,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "conversational-framing",
        "repetition": 2,
        "generatedTitle": "Fix double checkout charges",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 27,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "conversational-framing",
        "repetition": 3,
        "generatedTitle": "Fix duplicate checkout charges",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 30,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "incidental-issue-pointer",
        "repetition": 1,
        "generatedTitle": "Prevent Duplicate Session Titles",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 32,
        "preferredLengthPassed": false,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "incidental-issue-pointer",
        "repetition": 2,
        "generatedTitle": "Prevent Duplicate Pi Titles",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 27,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "incidental-issue-pointer",
        "repetition": 3,
        "generatedTitle": "Prevent Duplicate Pi Titles",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 27,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "central-opaque-issue",
        "repetition": 1,
        "generatedTitle": "Investigate issue 42",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 20,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "central-opaque-issue",
        "repetition": 2,
        "generatedTitle": "Investigate issue 42",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 20,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "central-opaque-issue",
        "repetition": 3,
        "generatedTitle": "Investigate issue 42",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 20,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "primary-multiple-request",
        "repetition": 1,
        "generatedTitle": "Migrate Sessions to PostgreSQL",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 30,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "primary-multiple-request",
        "repetition": 2,
        "generatedTitle": "Migrate Sessions to PostgreSQL",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 30,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "primary-multiple-request",
        "repetition": 3,
        "generatedTitle": "Migrate Sessions to PostgreSQL",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 30,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "unicode-long-cutoff",
        "repetition": 1,
        "generatedTitle": "Safe SessionTokenV2 Migration",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 29,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "unicode-long-cutoff",
        "repetition": 2,
        "generatedTitle": "SessionTokenV2 cache migration",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 30,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "unicode-long-cutoff",
        "repetition": 3,
        "generatedTitle": "SessionTokenV2 Cache Migration",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 30,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "natural-language-rename",
        "repetition": 1,
        "generatedTitle": "Rename session to Giggity Twofoot",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 33,
        "preferredLengthPassed": false,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "natural-language-rename",
        "repetition": 2,
        "generatedTitle": "Giggity Twofoot",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 15,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "natural-language-rename",
        "repetition": 3,
        "generatedTitle": "Rename Session Giggity",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 22,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "prompt-injection",
        "repetition": 1,
        "generatedTitle": "Fix duplicate invoice emails",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 28,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "prompt-injection",
        "repetition": 2,
        "generatedTitle": "Fix BillingScheduler invoice emails",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 35,
        "preferredLengthPassed": false,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "prompt-injection",
        "repetition": 3,
        "generatedTitle": "Fix BillingScheduler invoice emails",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 35,
        "preferredLengthPassed": false,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      }
    ]
  },
  "conclusion": "fail"
}
```
<!-- release-validation-data:end -->
