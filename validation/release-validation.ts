import type { AssistantMessage, Model, Api } from "@earendil-works/pi-ai/compat";
import {
  attemptTitleGeneration,
  extractTitleText,
  normalizeAndValidateTitle,
  type TimerCapability,
  type TitleModelCompletion,
  type TitleModelRegistryCapability,
} from "../src/index.js";

export const RELEASE_TARGET = Object.freeze({
  provider: "openai-codex",
  model: "gpt-5.4-mini",
  api: "openai-codex-responses",
  baseUrl: "https://chatgpt.com/backend-api",
  backend: "ChatGPT OAuth",
});

export const VALIDATION_CLASSIFICATIONS = [
  "pass",
  "fail",
  "skip",
  "environmental/inconclusive",
] as const;

export type ValidationClassification =
  (typeof VALIDATION_CLASSIFICATIONS)[number];

export type SanitizedDiagnostic =
  | "authentication-unavailable"
  | "backend-contract-failed"
  | "human-review-pending"
  | "model-unavailable"
  | "provider-request-failed"
  | "quality-threshold-failed"
  | "target-mismatch";

export type TargetMismatch =
  | "provider-mismatch"
  | "model-mismatch"
  | "api-mismatch"
  | "backend-mismatch"
  | "oauth-backend-mismatch";

export interface ReleaseFixture {
  id: string;
  prompt: string;
  forbiddenDetails: readonly string[];
  category?: string;
  semanticRequirements?: readonly string[];
  requiredExactIdentifiers?: readonly string[];
}

export interface OAuthAssertions {
  reasoningEffortNone: boolean;
  normalStop: boolean;
  nonEmptyTextOnly: boolean;
  noThinkingBlocks: boolean;
  reasoningTelemetryPresent: boolean;
  zeroReasoningUsage: boolean;
  productionTitleAccepted: boolean;
}

export interface OAuthEvidence {
  payloadReasoningEffort?: unknown;
  completion?: AssistantMessage;
  acceptedTitle?: string;
  errorKind?: SanitizedDiagnostic;
}

export interface OAuthValidationResult {
  classification: ValidationClassification;
  diagnostic: SanitizedDiagnostic | null;
  assertions: OAuthAssertions | null;
}

export interface QualityAttemptRecord {
  fixtureId: string;
  repetition: number;
  generatedTitle: string | null;
  classification: ValidationClassification;
  hardValidationPassed: boolean;
  codePointCount: number | null;
  preferredLengthPassed: boolean;
  forbiddenDetailsPassed: boolean;
  injectionPassed: boolean;
  humanSemanticPassed: boolean | null;
  humanRationale: string | null;
}

export interface ReleaseModelRegistry extends TitleModelRegistryCapability {
  isUsingOAuth(model: Model<Api>): boolean;
}

export interface QualityValidationResult {
  classification: ValidationClassification;
  diagnostic: SanitizedDiagnostic | null;
  attempts: QualityAttemptRecord[];
}

export interface ReleaseValidationReport {
  generatedAtUtc: string;
  testedCommit: string;
  piVersion: string;
  target: {
    provider: string;
    model: string;
    api: string;
    backend: string;
  };
  oauth: OAuthValidationResult;
  quality: {
    classification: ValidationClassification;
    diagnostic: SanitizedDiagnostic | null;
    attempts: QualityAttemptRecord[];
  };
  conclusion: ValidationClassification;
}

export function validateReleaseTarget(
  model: Model<Api>,
  isUsingOAuth: boolean,
): TargetMismatch[] {
  const mismatches: TargetMismatch[] = [];
  if (model.provider !== RELEASE_TARGET.provider) {
    mismatches.push("provider-mismatch");
  }
  if (model.id !== RELEASE_TARGET.model) mismatches.push("model-mismatch");
  if (model.api !== RELEASE_TARGET.api) mismatches.push("api-mismatch");
  if (model.baseUrl !== RELEASE_TARGET.baseUrl) {
    mismatches.push("backend-mismatch");
  }
  if (!isUsingOAuth) mismatches.push("oauth-backend-mismatch");
  return mismatches;
}

function isNonEmptyTextOnly(completion: AssistantMessage): boolean {
  return (
    completion.content.length > 0 &&
    completion.content.every(
      (block) => block.type === "text" && block.text.trim().length > 0,
    )
  );
}

export function classifyOAuthEvidence(
  evidence: OAuthEvidence,
): OAuthValidationResult {
  if (evidence.completion === undefined) {
    return {
      classification: "environmental/inconclusive",
      diagnostic: evidence.errorKind ?? "provider-request-failed",
      assertions: null,
    };
  }

  const completion = evidence.completion;
  const assertions: OAuthAssertions = {
    reasoningEffortNone: evidence.payloadReasoningEffort === "none",
    normalStop: completion.stopReason === "stop",
    nonEmptyTextOnly: isNonEmptyTextOnly(completion),
    noThinkingBlocks: completion.content.every(
      (block) => block.type !== "thinking",
    ),
    reasoningTelemetryPresent: completion.usage.reasoning !== undefined,
    zeroReasoningUsage: completion.usage.reasoning === 0,
    productionTitleAccepted:
      evidence.acceptedTitle !== undefined && evidence.acceptedTitle.length > 0,
  };

  const passed = Object.values(assertions).every(Boolean);
  return {
    classification: passed ? "pass" : "fail",
    diagnostic: passed ? null : "backend-contract-failed",
    assertions,
  };
}

const releaseTimer: TimerCapability = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle),
};

const releaseConfiguration = Object.freeze({
  enabled: true,
  model: {
    provider: RELEASE_TARGET.provider,
    id: RELEASE_TARGET.model,
  },
  timeoutMs: 10_000,
});

function isEnvironmentalProviderFailure(completion: AssistantMessage): boolean {
  if (completion.stopReason !== "error") return false;
  return /(?:429|quota|rate.?limit|timed?\s*out|timeout|network|econn|fetch failed|temporar|unavailable|50[234])/iu.test(
    completion.errorMessage ?? "",
  );
}

function payloadReasoningEffort(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) return undefined;
  const reasoning = (payload as { reasoning?: unknown }).reasoning;
  if (typeof reasoning !== "object" || reasoning === null) return undefined;
  return (reasoning as { effort?: unknown }).effort;
}

function completionWithPayloadObserver(
  complete: TitleModelCompletion,
  observe: (completion: AssistantMessage, effort: unknown) => void,
  onStart: () => void = () => undefined,
): TitleModelCompletion {
  return async (model, context, options) => {
    let effort: unknown;
    onStart();
    const completion = await complete(model, context, {
      ...options,
      onPayload(payload) {
        effort = payloadReasoningEffort(payload);
      },
    });
    observe(completion, effort);
    return completion;
  };
}

async function preflightReleaseTarget(
  registry: ReleaseModelRegistry,
): Promise<
  | { classification: "pass"; model: Model<Api> }
  | {
      classification: "fail" | "skip";
      diagnostic: SanitizedDiagnostic;
    }
> {
  const model = registry.find(RELEASE_TARGET.provider, RELEASE_TARGET.model);
  if (model === undefined) {
    return { classification: "fail", diagnostic: "model-unavailable" };
  }
  const authentication = await registry.getApiKeyAndHeaders(model);
  if (!authentication.ok) {
    return { classification: "skip", diagnostic: "authentication-unavailable" };
  }
  if (validateReleaseTarget(model, registry.isUsingOAuth(model)).length > 0) {
    return { classification: "fail", diagnostic: "target-mismatch" };
  }
  return { classification: "pass", model };
}

export async function runOAuthProbe(
  registry: ReleaseModelRegistry,
  complete: TitleModelCompletion,
): Promise<OAuthValidationResult> {
  const preflight = await preflightReleaseTarget(registry);
  if (preflight.classification !== "pass") {
    return {
      classification: preflight.classification,
      diagnostic: preflight.diagnostic,
      assertions: null,
    };
  }

  let completionStarted = false;
  let observedCompletion: AssistantMessage | undefined;
  let observedEffort: unknown;
  const observedComplete = completionWithPayloadObserver(
    complete,
    (completion, effort) => {
      observedCompletion = completion;
      observedEffort = effort;
    },
    () => {
      completionStarted = true;
    },
  );
  const acceptedTitle = await attemptTitleGeneration(
    "Verify explicit no-reasoning title generation.",
    releaseConfiguration,
    {
      modelRegistry: registry,
      titleModel: { complete: observedComplete },
      timer: releaseTimer,
    },
  );

  if (observedCompletion === undefined) {
    return completionStarted
      ? {
          classification: "environmental/inconclusive",
          diagnostic: "provider-request-failed",
          assertions: null,
        }
      : {
          classification: "skip",
          diagnostic: "authentication-unavailable",
          assertions: null,
        };
  }
  if (isEnvironmentalProviderFailure(observedCompletion)) {
    return {
      classification: "environmental/inconclusive",
      diagnostic: "provider-request-failed",
      assertions: null,
    };
  }
  return classifyOAuthEvidence({
    payloadReasoningEffort: observedEffort,
    completion: observedCompletion,
    ...(acceptedTitle === undefined ? {} : { acceptedTitle }),
  });
}

export async function runQualityValidation(
  fixtures: readonly ReleaseFixture[],
  repetitions: number,
  registry: ReleaseModelRegistry,
  complete: TitleModelCompletion,
): Promise<QualityValidationResult> {
  const preflight = await preflightReleaseTarget(registry);
  if (preflight.classification !== "pass") {
    return {
      classification: preflight.classification,
      diagnostic: preflight.diagnostic,
      attempts: [],
    };
  }

  const attempts: QualityAttemptRecord[] = [];
  for (const { fixture, repetition } of createQualityAttemptPlan(
    fixtures,
    repetitions,
  )) {
    let completionStarted = false;
    let observedCompletion: AssistantMessage | undefined;
    const observedComplete = completionWithPayloadObserver(
      complete,
      (completion) => {
        observedCompletion = completion;
      },
      () => {
        completionStarted = true;
      },
    );
    const acceptedTitle = await attemptTitleGeneration(
      fixture.prompt,
      releaseConfiguration,
      {
        modelRegistry: registry,
        titleModel: { complete: observedComplete },
        timer: releaseTimer,
      },
    );

    const rawTitle =
      observedCompletion === undefined
        ? undefined
        : extractTitleText(observedCompletion);
    const missingClassification: ValidationClassification =
      observedCompletion === undefined
        ? completionStarted
          ? "environmental/inconclusive"
          : "skip"
        : isEnvironmentalProviderFailure(observedCompletion)
          ? "environmental/inconclusive"
          : "fail";
    attempts.push(
      evaluateQualityAttempt(
        fixture,
        repetition,
        acceptedTitle ?? rawTitle,
        missingClassification,
      ),
    );
  }

  const classification = qualityGateClassification(attempts);
  return {
    classification,
    diagnostic:
      classification === "pass"
        ? null
        : classification === "fail"
          ? "quality-threshold-failed"
          : attempts.some(
                (attempt) =>
                  attempt.classification === "environmental/inconclusive" ||
                  attempt.classification === "skip",
              )
            ? "provider-request-failed"
            : "human-review-pending",
    attempts,
  };
}

export function createQualityAttemptPlan<TFixture extends ReleaseFixture>(
  fixtures: readonly TFixture[],
  repetitions: number,
): Array<{ fixture: TFixture; repetition: number }> {
  const attempts: Array<{ fixture: TFixture; repetition: number }> = [];
  for (const fixture of fixtures) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      attempts.push({ fixture, repetition });
    }
  }
  return attempts;
}

export function evaluateQualityAttempt(
  fixture: ReleaseFixture,
  repetition: number,
  generatedTitle: string | undefined,
  classificationWhenMissing: ValidationClassification = "fail",
): QualityAttemptRecord {
  const accepted =
    generatedTitle === undefined
      ? undefined
      : normalizeAndValidateTitle(generatedTitle);
  const codePointCount =
    accepted === undefined ? null : Array.from(accepted).length;
  const loweredGeneratedTitle = generatedTitle?.toLocaleLowerCase("en-US");
  const titleTokens: readonly string[] =
    loweredGeneratedTitle?.match(/[\p{L}\p{N}_]+/gu) ?? [];
  const forbiddenDetailsPassed =
    loweredGeneratedTitle !== undefined &&
    fixture.forbiddenDetails.every(
      (detail) =>
        !loweredGeneratedTitle.includes(detail.toLocaleLowerCase("en-US")),
    );
  // Conservative zero tolerance: every word-like token sourced from a
  // fixture's forbidden details is also treated as a possible injected
  // instruction fragment. This catches compounds such as "TDD-driven" and
  // partial payloads such as "PWNED" from "PWNED TITLE" without a second list.
  const injectionPassed =
    loweredGeneratedTitle !== undefined &&
    fixture.forbiddenDetails
      .flatMap(
        (detail) =>
          detail.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}_]+/gu) ?? [],
      )
      .every((token) => !titleTokens.includes(token));
  const hardValidationPassed = accepted !== undefined;
  const preferredLengthPassed =
    codePointCount !== null && codePointCount >= 15 && codePointCount <= 30;

  return {
    fixtureId: fixture.id,
    repetition,
    generatedTitle: generatedTitle ?? null,
    classification:
      hardValidationPassed && forbiddenDetailsPassed && injectionPassed
        ? "pass"
        : classificationWhenMissing,
    hardValidationPassed,
    codePointCount,
    preferredLengthPassed,
    forbiddenDetailsPassed,
    injectionPassed,
    humanSemanticPassed: null,
    humanRationale: null,
  };
}

export function recomputeHumanReviewedAttempts(
  recordedAttempts: readonly QualityAttemptRecord[],
  fixtures: readonly ReleaseFixture[],
): QualityAttemptRecord[] {
  const plan = createQualityAttemptPlan(fixtures, 3);
  if (recordedAttempts.length !== plan.length || plan.length !== 36) {
    throw new Error("Human review requires the exact 36-attempt fixture plan.");
  }

  return plan.map(({ fixture, repetition }, index) => {
    const recorded = recordedAttempts[index];
    if (
      recorded === undefined ||
      recorded.fixtureId !== fixture.id ||
      recorded.repetition !== repetition
    ) {
      throw new Error("Human review attempt identities do not match the retained fixture plan.");
    }
    const recomputed = evaluateQualityAttempt(
      fixture,
      repetition,
      recorded.generatedTitle ?? undefined,
    );
    return {
      ...recomputed,
      humanSemanticPassed: recorded.humanSemanticPassed,
      humanRationale: recorded.humanRationale,
    };
  });
}

export function recomputeOAuthValidation(
  oauth: OAuthValidationResult,
): OAuthValidationResult {
  if (oauth.assertions === null) {
    return {
      classification:
        oauth.classification === "skip"
          ? "skip"
          : oauth.classification === "fail"
            ? "fail"
            : "environmental/inconclusive",
      diagnostic: oauth.diagnostic,
      assertions: null,
    };
  }
  const passed = Object.values(oauth.assertions).every(Boolean);
  return {
    classification: passed ? "pass" : "fail",
    diagnostic: passed ? null : "backend-contract-failed",
    assertions: oauth.assertions,
  };
}

export function qualityGateClassification(
  attempts: readonly QualityAttemptRecord[],
): ValidationClassification {
  if (attempts.length !== 36) return "environmental/inconclusive";
  if (
    attempts.some(
      (attempt) =>
        attempt.classification === "skip" ||
        attempt.classification === "environmental/inconclusive",
    )
  ) {
    return "environmental/inconclusive";
  }
  if (
    attempts.some(
      (attempt) =>
        attempt.classification === "fail" ||
        !attempt.hardValidationPassed ||
        !attempt.forbiddenDetailsPassed ||
        !attempt.injectionPassed,
    )
  ) {
    return "fail";
  }
  if (attempts.filter((attempt) => attempt.preferredLengthPassed).length < 33) {
    return "fail";
  }
  if (
    attempts.some(
      (attempt) =>
        attempt.humanSemanticPassed === null ||
        attempt.humanRationale === null ||
        attempt.humanRationale.trim() === "",
    )
  ) {
    return "environmental/inconclusive";
  }
  return attempts.filter((attempt) => attempt.humanSemanticPassed).length >= 33
    ? "pass"
    : "fail";
}

export function releaseGateConclusion(input: {
  oauth: Pick<OAuthValidationResult, "classification">;
  quality: readonly QualityAttemptRecord[];
}): ValidationClassification {
  const quality = qualityGateClassification(input.quality);
  if (input.oauth.classification === "fail" || quality === "fail") {
    return "fail";
  }
  if (input.oauth.classification !== "pass" || quality !== "pass") {
    return "environmental/inconclusive";
  }
  return "pass";
}

export function renderReleaseValidationReport(
  report: ReleaseValidationReport,
): string {
  const preferred = report.quality.attempts.filter(
    (attempt) => attempt.preferredLengthPassed,
  ).length;
  const hard = report.quality.attempts.filter(
    (attempt) => attempt.hardValidationPassed,
  ).length;
  const forbidden = report.quality.attempts.filter(
    (attempt) => attempt.forbiddenDetailsPassed,
  ).length;
  const injection = report.quality.attempts.filter(
    (attempt) => attempt.injectionPassed,
  ).length;
  const humanReviewed = report.quality.attempts.filter(
    (attempt) =>
      attempt.humanSemanticPassed !== null &&
      attempt.humanRationale !== null &&
      attempt.humanRationale.trim() !== "",
  ).length;
  const humanPassed = report.quality.attempts.filter(
    (attempt) => attempt.humanSemanticPassed === true,
  ).length;

  return `# Release validation

This tracked report contains only fixed synthetic-fixture titles and sanitized classifications. It must never contain credentials, authorization material, cookies, headers, environment values, or raw provider errors.

## Commands, prerequisites, and classification

- \`npm run validate:oauth\` runs one live OAuth probe.
- \`npm run validate:quality\` runs one fresh, complete set of 36 live quality attempts.
- \`npm run validate:review\` performs only offline recomputation after a human edits all 36 embedded JSON judgments and rationales; it makes no model or network call and is not an LLM judge.
- After committing failed or stale evidence for history, \`npm run validate:reset\` prepares this report for both fresh gates against a new candidate.
- Live prerequisites: Pi 0.80.10, stored ChatGPT OAuth authentication for exact \`openai-codex/gpt-5.4-mini\`, network access, and available provider quota/allowance.
- Taxonomy: \`pass\`, \`fail\`, \`skip\`, and \`environmental/inconclusive\`. Missing authentication is \`skip\`; transient network/quota/provider failures may be \`environmental/inconclusive\`; neither satisfies the release gate.

## Run identity

- Generated at (UTC): \`${report.generatedAtUtc}\`
- Tested commit: \`${report.testedCommit}\`
- Pi version: \`${report.piVersion}\`
- Target: \`${report.target.provider}/${report.target.model}\`
- API: \`${report.target.api}\`
- Authentication backend: ${report.target.backend}

## OAuth probe

- Classification: **${report.oauth.classification}**
- Sanitized diagnostic: \`${report.oauth.diagnostic ?? "none"}\`
- Payload/completion assertions: ${report.oauth.assertions === null ? "not available" : `\`${JSON.stringify(report.oauth.assertions)}\``}

## Representative quality run

- Classification: **${report.quality.classification}**
- Sanitized diagnostic: \`${report.quality.diagnostic ?? "none"}\`
- Attempts recorded: ${report.quality.attempts.length}/36
- Hard validation: ${hard}/36 (required 36)
- Preferred 15–30 code points: ${preferred}/36 (required at least 33)
- Forbidden-detail exclusion: ${forbidden}/36 (required 36)
- Injection/token-fragment exclusion: ${injection}/36 (required 36)
- Human semantic review: ${humanReviewed}/36 reviewed with non-empty rationales; ${humanPassed}/36 passed (required at least 33)

## Human semantic-review procedure

A human reviewer must inspect all 36 generated titles against the corresponding retained fixture. In the embedded JSON below, set every \`humanSemanticPassed\` to \`true\` or \`false\` and every \`humanRationale\` to a non-empty short explanation stating whether the title is specific, glanceable, and descriptive of the primary requested outcome or topic. Then run \`npm run validate:review\` to validate and atomically rerender the report. Exact-identifier-only requirements are informational and excluded from the semantic threshold. Do not use an LLM judge, retry, replace, omit, repair, or selectively rerun an attempt. A pending judgment or rationale keeps the final gate environmental/inconclusive.

## Final release gate

**${report.conclusion}**

<!-- release-validation-data:start -->
\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`
<!-- release-validation-data:end -->
`;
}
