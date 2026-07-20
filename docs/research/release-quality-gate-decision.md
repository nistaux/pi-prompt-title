# Release-quality gate decision

## Decision

**Approved decision:** freeze the restored production instruction and amend [Implement automatic asynchronous Pi session titles](https://github.com/nistaux/pi-prompt-title/issues/16) and [Add and record credential-gated release validation](https://github.com/nistaux/pi-prompt-title/issues/26) so the 15–30-code-point result remains a mandatory per-attempt and aggregate diagnostic, but is not an independent machine release blocker. Preserve 36/36 hard validity, zero forbidden/injected details, the complete 36-title human review, and the 33/36 human semantic/glanceability threshold.

The owner approved this product-policy amendment after reviewing its practical effect. It is not an instruction correction or a human judgment. No live gate or human review was performed during the research phase.

## Evidence

### Retained runs

The corrected instruction variants produced complete, non-selective preferred-length counts of 27, 32, 33, 31, 30, 28, and 32 out of 36. Stricter wording also introduced occasional hard-limit, path-retention, and under-length regressions. Every result was retained.

More importantly, `src/title.ts` is byte-identical at `a5bc7b4`, `7c764be`, and `871c5f7`, yet those cohorts produced:

| Candidate | Hard-valid | Preferred length | Forbidden/injection exclusion |
| --- | ---: | ---: | ---: |
| `a5bc7b4` | 36/36 | 33/36 | 36/36 |
| `7c764be` | 35/36 | 31/36 | 36/36 |
| `871c5f7` | 36/36 | 32/36 | 36/36 |

The descriptive aggregate for these three same-instruction cohorts is 96/108 preferred and 107/108 hard-valid. It is **not** a 108-observation IID estimate: outputs are clustered within 12 repeated fixtures, the hosted model can change without a repository change, and the fixtures had already informed prompt edits. The useful conclusion is only that the unchanged production instruction crossed the 33/36 pass/fail boundary.

The latest retained run’s four preferred-length misses are concentrated in two fixtures: three 33–38-code-point outputs for `exact-model-identifier` and one 35-code-point output for `prompt-injection`. Ten fixtures were 3/3 in range. This is direct evidence of fixture-policy interaction, not proof that any one prompt clause caused the misses.

### Causal assessment

1. **Prompt quality was an initial contributor.** Early runs had rename, path, hard-limit, and verbosity failures. General instruction corrections improved those failure modes.
2. **Further prompt-only tuning is not an established fix.** Reactive tightening produced new regressions, and restoring the only passing instruction still yielded 32/36. The same known fixtures are now development evidence rather than a clean holdout.
3. **Model stochasticity is materially involved.** OpenAI documents non-deterministic generated output and recommends representative, continuous evals rather than relying on isolated examples. The three identical-instruction cohorts directly demonstrate output variation in this repository.
4. **The single-run threshold is the immediate blocker.** The difference between 32/36 and 33/36 is one sampled output, yet it flips release status. [Implement automatic asynchronous Pi session titles](https://github.com/nistaux/pi-prompt-title/issues/16) defines no target population, sampling frame, confidence level, or inferential rule. NIST’s guidance for binomial proportions uses confidence intervals rather than treating a small sample proportion as the true rate.
5. **Fixture/policy interaction makes the cliff especially brittle.** One systematically difficult fixture can consume all three allowed misses; one additional stochastic miss then fails the cohort.
6. **Semantic quality is unknown.** No human judgments exist. Machine length results cannot be substituted for the required human assessment of specificity, glanceability, and primary-topic fit.

## Options

| Option | Product-contract status | Privacy/cost/compatibility and evidence consequences |
| --- | --- | --- |
| Systematic instruction research with preregistered development and unseen holdout fixtures | Preserves runtime/product boundaries; changes the research process only | Same production privacy/model/retry behavior, but more live cost. It needs new fixtures, fixed candidates/cohorts, and no stopping on a pass. Further tuning on the current 12 fixtures risks overfitting. |
| Change the default model or reasoning mode | Amends default model/backend/no-reasoning guarantees | Requires new authentication, cost, compatibility, payload, documentation, and complete release evidence. No comparative evidence currently supports a replacement. |
| Lower 33/36 to 32/36 | Amends the release threshold | Minimal implementation impact but post-hoc and still a one-output cliff. Not recommended. |
| Use a larger/statistical gate | Amends attempt count and acceptance contract | More cost and human-review burden; requires an owner-defined target population, minimum rate, confidence rule, fixed sample, and cluster-aware design. Current evidence cannot supply those product choices. |
| Retry, fallback, truncate, repair, or fixture-specific logic | Amends core one-shot/privacy-cost/no-repair guarantees | Explicitly conflicts with [Implement automatic asynchronous Pi session titles](https://github.com/nistaux/pi-prompt-title/issues/16) and changes runtime behavior. Reject. |
| Remove/replace difficult retained fixtures | Amends the representative gate | Destroys comparability and hides known edge cases. Reject. |
| Keep preferred length diagnostic; retain hard, exclusion, and human gates | Narrowly amends release policy only | Production privacy, cost, compatibility, exact model, one-shot behavior, validation, and retry/fallback remain unchanged. It aligns release blocking with the 40-code-point runtime limit and the explicit human glanceability gate. |

## Recommended contract amendment

Apply this change to the representative quality gate in [Implement automatic asynchronous Pi session titles](https://github.com/nistaux/pi-prompt-title/issues/16) and mirror it in [Add and record credential-gated release validation](https://github.com/nistaux/pi-prompt-title/issues/26):

```diff
 Run the retained 12 fixtures with three isolated one-attempt calls each,
 for 36 total titles and no cherry-picked substitutions. Require:

 * 36/36 titles at or below 40 Unicode code points and passing hard format validation;
-* at least 33/36 titles within the preferred 15–30-code-point range;
+* record and report each title's 15–30-code-point result and the aggregate;
+  preferred length is a product-quality diagnostic and an input to human
+  glanceability review, not an independent machine pass/fail threshold;
 * at least 33/36 titles judged specific, glanceable, and descriptive of the
   primary outcome or topic;
 * zero inclusion of injected instructions or forbidden incidental details; and
 * no exact-identifier retention threshold.
```

Also harden the evidence contract before another live run:

```diff
+ Before live execution, commit a run manifest containing the candidate SHA,
+ production-instruction hash, fixture-set hash, exact model/backend identity,
+ and planned cohort count. The first started cohort is the eligible cohort.
+ Every started, incomplete, environmental, failed, and passing attempt remains
+ recorded. Resetting or rerunning the same production fingerprint cannot replace
+ its result. Any additional cohort requires explicit owner approval and is
+ reported cumulatively, never substituted for earlier evidence.
```

The anti-retry addition closes a mechanical loophole: the current reset path can return the report to `not-run` without proving a changed production fingerprint, even though documentation forbids same-candidate replacement runs.

Do not change `TITLE_GENERATION_INSTRUCTION`, fixtures, `normalizeAndValidateTitle()`, the 40-code-point maximum, the exact model/backend, one-shot execution, or the 33/36 human threshold.

## Acceptance criteria after approval

1. The approved issue text explicitly records the preferred-length policy amendment and anti-retry evidence rule.
2. `qualityGateClassification()` cannot fail solely because fewer than 33 titles are in the preferred range.
3. Reports retain every `codePointCount`, `preferredLengthPassed`, and aggregate preferred count without calling 33 mandatory.
4. Exactly 36 attempts, 36/36 hard validity, 36/36 forbidden-detail exclusion, and 36/36 injection exclusion remain machine requirements.
5. All 36 human judgments and non-empty rationales remain required; at least 33/36 must pass semantic/glanceability review.
6. A committed manifest binds candidate, instruction, fixtures, model/backend, and cohort count before live execution; same-fingerprint reset/rerun cannot replace evidence.
7. No retry, selective rerun, substitution, fixture removal, deterministic repair, fallback, private prompt, or model/provider change is introduced.
8. Historical reports remain immutable evidence under the policy active when they ran.

## Validation plan after approval

1. Use TDD at the exported classifier/report-store seams.
2. Add focused tests for 32 preferred + 33 human passes succeeding; every hard/exclusion failure failing; fewer than 33 human passes failing; pending review remaining inconclusive; and non-36 plans remaining inconclusive.
3. Add manifest/reset tests proving the same production fingerprint cannot obtain replacement evidence and every started outcome remains retained.
4. Update report rendering and contributor documentation while preserving preferred-length telemetry.
5. Run focused tests and typechecking, then `npm run check`.
6. Commit the deterministic candidate before live validation.
7. Run the preregistered OAuth probe and exactly one complete 36-attempt cohort; retain and commit every outcome.
8. Only after the unchanged hard/exclusion gates pass, obtain genuine human review of all 36 titles. Do not use an LLM judge.
9. Run two-axis review against `origin/main`, fix findings, rerun deterministic validation, and commit all work.

## Residual risks

Making preferred length diagnostic could allow more 31–40-code-point titles than the prior release gate. The unchanged hard maximum and human glanceability gate mitigate but do not eliminate that risk. If the owner instead intends 15–30 adherence to be an independently release-critical reliability SLO, retain 33/36 and leave the candidate failed; then commission a separate preregistered study with unseen representative fixtures and an owner-defined statistical target rather than another wording tweak.

## Primary sources and repository evidence

- [Implement automatic asynchronous Pi session titles](https://github.com/nistaux/pi-prompt-title/issues/16) — authoritative product/release contract
- [Add and record credential-gated release validation](https://github.com/nistaux/pi-prompt-title/issues/26) — harness and retained-run history
- [Correct title instruction after failed release quality gate](https://github.com/nistaux/pi-prompt-title/issues/37) — instruction history and escalation
- [Current retained report at historical evidence commit](https://github.com/nistaux/pi-prompt-title/blob/5c58c01/docs/validation/release-validation.md)
- [Representative fixtures](./title-quality-fixtures.json)
- [Prototype findings](./title-quality-prototype.md)
- [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [OpenAI prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)
- [NIST confidence intervals for a binomial proportion](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm)
