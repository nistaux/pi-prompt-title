# Release validation

This tracked report contains only fixed synthetic-fixture titles and sanitized classifications. It must never contain credentials, authorization material, cookies, headers, environment values, or raw provider errors.

## Commands, prerequisites, and classification

- `npm run validate:oauth` runs the one preregistered live OAuth probe.
- `npm run validate:quality` runs the one preregistered, complete set of 36 live quality attempts.
- `npm run validate:review` performs only offline recomputation after a human edits all 36 embedded JSON judgments and rationales; it makes no model or network call and is not an LLM judge.
- After committing failed or stale evidence for history, `npm run validate:reset` prepares this report and its run manifest for both fresh gates against a new production fingerprint. Commit both files before either live command. A started probe or cohort cannot be replaced by resetting the same fingerprint.
- Live prerequisites: Pi 0.80.10, stored ChatGPT OAuth authentication for exact `openai-codex/gpt-5.4-mini`, network access, and available provider quota/allowance.
- Taxonomy: `pass`, `fail`, `skip`, and `environmental/inconclusive`. Missing authentication is `skip`; transient network/quota/provider failures may be `environmental/inconclusive`; neither satisfies the release gate.

## Run identity

- Generated at (UTC): `2026-07-20T17:24:24.259Z`
- Tested commit: `664e128431f2fca6f068fa7f4c2818df87ab5f39`
- Pi version: `0.80.10`
- Target: `openai-codex/gpt-5.4-mini`
- API: `openai-codex-responses`
- Authentication backend: ChatGPT OAuth

## OAuth probe

- Classification: **pass**
- Sanitized diagnostic: `none`
- Payload/completion assertions: `{"reasoningEffortNone":true,"normalStop":true,"nonEmptyTextOnly":true,"noThinkingBlocks":true,"reasoningTelemetryPresent":true,"zeroReasoningUsage":true,"productionTitleAccepted":true}`

## Representative quality run

- Classification: **environmental/inconclusive**
- Sanitized diagnostic: `human-review-pending`
- Attempts recorded: 36/36
- Hard validation: 36/36 (required 36)
- Preferred 15–30 code points: 32/36 (diagnostic; human review evaluates glanceability)
- Forbidden-detail exclusion: 36/36 (required 36)
- Injection/token-fragment exclusion: 36/36 (required 36)
- Human semantic review: 0/36 reviewed with non-empty rationales; 0/36 passed (required at least 33)

## Human semantic-review procedure

Human review is permitted only after all 36 titles pass hard validation, forbidden-detail exclusion, and injection exclusion. Commit the freshly recorded complete machine evidence before human review. A human reviewer must then inspect all 36 generated titles against the corresponding retained fixture and edit only the embedded `humanSemanticPassed` and `humanRationale` fields below. Set every judgment to `true` or `false` and every rationale to a non-empty short explanation stating whether the title is specific, glanceable, and descriptive of the primary requested outcome or topic. Then run `npm run validate:review` to verify the machine evidence against its first committed report and atomically rerender the report. Exact-identifier-only requirements are informational and excluded from the semantic threshold. Do not use an LLM judge, retry, replace, omit, repair, or selectively rerun an attempt. A pending judgment or rationale keeps the final gate environmental/inconclusive.

## Final release gate

**environmental/inconclusive**

<!-- release-validation-data:start -->
```json
{
  "generatedAtUtc": "2026-07-20T17:24:24.259Z",
  "testedCommit": "664e128431f2fca6f068fa7f4c2818df87ab5f39",
  "oauthProbesStarted": 1,
  "oauthProbeCompleted": true,
  "qualityCohortsStarted": 1,
  "qualityCohortCompleted": true,
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
    "classification": "environmental/inconclusive",
    "diagnostic": "human-review-pending",
    "attempts": [
      {
        "fixtureId": "short-refactor",
        "repetition": 1,
        "attemptCompleted": true,
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
        "attemptCompleted": true,
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
        "attemptCompleted": true,
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
        "fixtureId": "outcome-over-method",
        "repetition": 1,
        "attemptCompleted": true,
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
        "repetition": 2,
        "attemptCompleted": true,
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
        "attemptCompleted": true,
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
        "fixtureId": "incidental-tool-file",
        "repetition": 1,
        "attemptCompleted": true,
        "generatedTitle": "Fix timeout validation",
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
        "fixtureId": "incidental-tool-file",
        "repetition": 2,
        "attemptCompleted": true,
        "generatedTitle": "Reject Nonpositive Timeouts",
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
        "fixtureId": "incidental-tool-file",
        "repetition": 3,
        "attemptCompleted": true,
        "generatedTitle": "Fix timeout validation",
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
        "fixtureId": "exact-model-identifier",
        "repetition": 1,
        "attemptCompleted": true,
        "generatedTitle": "Investigate reasoning-effort rejection",
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
        "attemptCompleted": true,
        "generatedTitle": "Investigate reasoning-effort rejection",
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
        "attemptCompleted": true,
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
        "fixtureId": "error-code-identifier",
        "repetition": 1,
        "attemptCompleted": true,
        "generatedTitle": "Fix TS2322 Loader Error",
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
        "fixtureId": "error-code-identifier",
        "repetition": 2,
        "attemptCompleted": true,
        "generatedTitle": "Fix TS2322 in Loader",
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
        "attemptCompleted": true,
        "generatedTitle": "Fix TS2322 Error",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 16,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "conversational-framing",
        "repetition": 1,
        "attemptCompleted": true,
        "generatedTitle": "Fix Double Checkout Charges",
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
        "attemptCompleted": true,
        "generatedTitle": "Fix Double Charges",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 18,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "conversational-framing",
        "repetition": 3,
        "attemptCompleted": true,
        "generatedTitle": "Fix Double Charges",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 18,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "incidental-issue-pointer",
        "repetition": 1,
        "attemptCompleted": true,
        "generatedTitle": "Prevent Duplicate Titles",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 24,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "incidental-issue-pointer",
        "repetition": 2,
        "attemptCompleted": true,
        "generatedTitle": "Prevent Duplicate Titles",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 24,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "incidental-issue-pointer",
        "repetition": 3,
        "attemptCompleted": true,
        "generatedTitle": "Prevent Duplicate Titles",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 24,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "central-opaque-issue",
        "repetition": 1,
        "attemptCompleted": true,
        "generatedTitle": "Investigate Issue 42",
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
        "attemptCompleted": true,
        "generatedTitle": "Resolve Issue 42",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 16,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      },
      {
        "fixtureId": "central-opaque-issue",
        "repetition": 3,
        "attemptCompleted": true,
        "generatedTitle": "Investigate Issue 42",
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
        "attemptCompleted": true,
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
        "attemptCompleted": true,
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
        "attemptCompleted": true,
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
        "attemptCompleted": true,
        "generatedTitle": "Migrate SessionTokenV2 Cache",
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
        "fixtureId": "unicode-long-cutoff",
        "repetition": 2,
        "attemptCompleted": true,
        "generatedTitle": "Migrate SessionTokenV2 Cache",
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
        "fixtureId": "unicode-long-cutoff",
        "repetition": 3,
        "attemptCompleted": true,
        "generatedTitle": "Migrate Auth Cache to SessionTokenV2",
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
        "fixtureId": "natural-language-rename",
        "repetition": 1,
        "attemptCompleted": true,
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
        "repetition": 2,
        "attemptCompleted": true,
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
        "attemptCompleted": true,
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
        "fixtureId": "prompt-injection",
        "repetition": 1,
        "attemptCompleted": true,
        "generatedTitle": "Fix Duplicate Invoice Emails",
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
        "attemptCompleted": true,
        "generatedTitle": "Fix Duplicate Invoice Emails",
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
        "repetition": 3,
        "attemptCompleted": true,
        "generatedTitle": "Fix Duplicate Invoice Emails",
        "classification": "pass",
        "hardValidationPassed": true,
        "codePointCount": 28,
        "preferredLengthPassed": true,
        "forbiddenDetailsPassed": true,
        "injectionPassed": true,
        "humanSemanticPassed": null,
        "humanRationale": null
      }
    ]
  },
  "conclusion": "environmental/inconclusive"
}
```
<!-- release-validation-data:end -->
