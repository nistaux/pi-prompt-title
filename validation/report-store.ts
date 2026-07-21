import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { TITLE_GENERATION_INSTRUCTION } from "../src/index.js";
import {
  RELEASE_TARGET,
  qualityGateClassification,
  recomputeHumanReviewedAttempts,
  recomputeOAuthValidation,
  releaseGateConclusion,
  renderReleaseValidationReport,
  type OAuthValidationResult,
  type QualityAttemptRecord,
  type QualityValidationResult,
  type ReleaseFixture,
  type ReleaseValidationReport,
} from "./release-validation.js";

const execFileAsync = promisify(execFile);
const reportUrl = new URL(
  "../docs/validation/release-validation.md",
  import.meta.url,
);
const reportPath = fileURLToPath(reportUrl);
const reportRepositoryPath = "docs/validation/release-validation.md";
const manifestUrl = new URL(
  "../docs/validation/release-validation-manifest.json",
  import.meta.url,
);
const manifestPath = fileURLToPath(manifestUrl);
const manifestRepositoryPath =
  "docs/validation/release-validation-manifest.json";
const approvedPostEvidenceCorrectionPreregistration =
  "94c166cb160b529c526083c76dbb25ee47873956";
const approvedPostEvidenceCorrectionPaths = new Set([
  reportRepositoryPath,
  "validation/release-validation.ts",
  "validation/report-store.ts",
  "test/release-validation.test.ts",
  "README.md",
  "docs/research/release-quality-gate-decision.md",
]);
const fixtureUrl = new URL(
  "../docs/research/title-quality-fixtures.json",
  import.meta.url,
);
const lockPath = `${reportPath}.lock`;

export interface ReleaseRunManifest {
  schema: 1;
  createdAtUtc: string;
  candidateCommit: string;
  instructionSha256: string;
  fixtureSetSha256: string;
  target: {
    provider: string;
    model: string;
    api: string;
    baseUrl: string;
    backend: string;
  };
  plannedOAuthProbes: 1;
  plannedQualityCohorts: 1;
}

export function createReleaseRunManifest(input: {
  candidateCommit: string;
  createdAtUtc: string;
  instruction: string;
  fixtureSetContents: string;
}): ReleaseRunManifest {
  const sha256 = (value: string) =>
    createHash("sha256").update(value, "utf8").digest("hex");
  return {
    schema: 1,
    createdAtUtc: input.createdAtUtc,
    candidateCommit: input.candidateCommit,
    instructionSha256: sha256(input.instruction),
    fixtureSetSha256: sha256(input.fixtureSetContents),
    target: {
      provider: RELEASE_TARGET.provider,
      model: RELEASE_TARGET.model,
      api: RELEASE_TARGET.api,
      baseUrl: RELEASE_TARGET.baseUrl,
      backend: RELEASE_TARGET.backend,
    },
    plannedOAuthProbes: 1,
    plannedQualityCohorts: 1,
  };
}

export function assertOAuthProbeAvailable(
  report: { oauthProbesStarted?: number },
  manifest: ReleaseRunManifest,
): void {
  if ((report.oauthProbesStarted ?? 0) >= manifest.plannedOAuthProbes) {
    throw new Error("The planned OAuth probe has already started.");
  }
}

export function assertQualityCheckpointProgress(
  previous: readonly QualityAttemptRecord[],
  next: readonly QualityAttemptRecord[],
): void {
  if (next.length === previous.length + 1) {
    if (
      JSON.stringify(next.slice(0, previous.length)) !==
        JSON.stringify(previous) ||
      next.at(-1)?.attemptCompleted !== false
    ) {
      throw new Error(
        "A quality start checkpoint must append one incomplete attempt to its immutable prefix.",
      );
    }
    return;
  }
  if (next.length === previous.length && previous.length > 0) {
    const previousAttempt = previous.at(-1);
    const nextAttempt = next.at(-1);
    if (
      JSON.stringify(next.slice(0, -1)) !==
        JSON.stringify(previous.slice(0, -1)) ||
      previousAttempt?.attemptCompleted !== false ||
      nextAttempt?.attemptCompleted !== true ||
      previousAttempt.fixtureId !== nextAttempt.fixtureId ||
      previousAttempt.repetition !== nextAttempt.repetition
    ) {
      throw new Error(
        "A quality completion checkpoint must finalize only its last incomplete attempt and preserve the immutable prefix.",
      );
    }
    return;
  }
  throw new Error(
    "A quality checkpoint must start or complete exactly one attempt.",
  );
}

export function assertQualityCohortAvailable(
  report: { qualityCohortsStarted?: number },
  manifest: ReleaseRunManifest,
): void {
  if ((report.qualityCohortsStarted ?? 0) >= manifest.plannedQualityCohorts) {
    throw new Error("The planned quality cohort has already started.");
  }
}

function productionFingerprint(manifest: ReleaseRunManifest): string {
  return JSON.stringify({
    candidateCommit: manifest.candidateCommit,
    instructionSha256: manifest.instructionSha256,
    fixtureSetSha256: manifest.fixtureSetSha256,
    target: manifest.target,
  });
}

function runMarkerRef(
  manifest: ReleaseRunManifest,
  kind: "oauth" | "quality",
): string {
  const fingerprint = createHash("sha256")
    .update(productionFingerprint(manifest), "utf8")
    .digest("hex");
  return `refs/pi-prompt-title/release-validation/${fingerprint}/${kind}`;
}

async function reserveRunMarker(
  manifest: ReleaseRunManifest,
  kind: "oauth" | "quality",
): Promise<void> {
  try {
    await execFileAsync("git", [
      "update-ref",
      runMarkerRef(manifest, kind),
      "HEAD",
      "0000000000000000000000000000000000000000",
    ]);
  } catch {
    throw new Error(
      `The preregistered ${kind} run has already started for this production fingerprint.`,
    );
  }
}

async function assertNoRunMarkers(manifest: ReleaseRunManifest): Promise<void> {
  for (const kind of ["oauth", "quality"] as const) {
    try {
      await execFileAsync("git", [
        "show-ref",
        "--verify",
        "--quiet",
        runMarkerRef(manifest, kind),
      ]);
    } catch {
      continue;
    }
    throw new Error(
      "Cannot reset evidence for the same production fingerprint after a live run has started.",
    );
  }
}

export function assertExistingEvidencePair(
  existingReport:
    | {
        oauthProbesStarted?: number;
        qualityCohortsStarted?: number;
      }
    | undefined,
  existingManifest: ReleaseRunManifest | undefined,
): void {
  if (existingManifest !== undefined && existingReport === undefined) {
    throw new Error(
      "The preregistered release report is missing or malformed; existing evidence cannot be reset.",
    );
  }
  if (
    existingManifest === undefined &&
    existingReport !== undefined &&
    ((existingReport.oauthProbesStarted ?? 0) > 0 ||
      (existingReport.qualityCohortsStarted ?? 0) > 0)
  ) {
    throw new Error(
      "The release run manifest is missing; existing evidence cannot be reset.",
    );
  }
}

export function assertResetAllowed(input: {
  existingReport: {
    oauthProbesStarted?: number;
    qualityCohortsStarted?: number;
  };
  existingManifest: ReleaseRunManifest;
  nextManifest: ReleaseRunManifest;
}): void {
  if (
    ((input.existingReport.oauthProbesStarted ?? 0) > 0 ||
      (input.existingReport.qualityCohortsStarted ?? 0) > 0) &&
    productionFingerprint(input.existingManifest) ===
      productionFingerprint(input.nextManifest)
  ) {
    throw new Error(
      "Cannot reset evidence for the same production fingerprint after a live probe or cohort has started.",
    );
  }
}
const dataPattern =
  /<!-- release-validation-data:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- release-validation-data:end -->/u;

async function installedPiVersion(): Promise<string> {
  const contents = await readFile(
    new URL(
      "../node_modules/@earendil-works/pi-coding-agent/package.json",
      import.meta.url,
    ),
    "utf8",
  );
  return (JSON.parse(contents) as { version: string }).version;
}

async function emptyReport(
  generatedAtUtc: string,
  testedCommit: string,
): Promise<ReleaseValidationReport> {
  return {
    generatedAtUtc,
    testedCommit,
    candidateCommit: testedCommit,
    preregistrationCommit: testedCommit,
    oauthProbesStarted: 0,
    oauthProbeCompleted: false,
    qualityCohortsStarted: 0,
    qualityCohortCompleted: false,
    piVersion: await installedPiVersion(),
    target: {
      provider: RELEASE_TARGET.provider,
      model: RELEASE_TARGET.model,
      api: RELEASE_TARGET.api,
      backend: RELEASE_TARGET.backend,
    },
    oauth: {
      classification: "environmental/inconclusive",
      diagnostic: "provider-request-failed",
      assertions: null,
    },
    quality: {
      classification: "environmental/inconclusive",
      diagnostic: "human-review-pending",
      attempts: [],
    },
    conclusion: "environmental/inconclusive",
  };
}

export function changedCandidatePaths(porcelainStatus: string): string[] {
  return porcelainStatus
    .split(/\r?\n/u)
    .filter((line) => line.length >= 4)
    .map((line) => line.slice(3));
}

export function assertCleanCandidateStatus(porcelainStatus: string): void {
  const disallowed = changedCandidatePaths(porcelainStatus).filter(
    (path) => path !== reportRepositoryPath,
  );
  if (disallowed.length > 0) {
    throw new Error(
      "Release validation requires a clean committed candidate; only the tracked release report may be modified.",
    );
  }
}

export function assertHumanReviewCandidateHistory(input: {
  testedCommit: string;
  currentCommit: string;
  testedCommitIsAncestor: boolean;
  changedPaths: readonly string[];
  mergeCommits?: readonly string[];
  postEvidenceCorrectionCommits?: readonly string[];
  manifestMatchesCurrentFingerprint?: boolean;
}): void {
  if (!input.testedCommitIsAncestor) {
    throw new Error(
      "Human review HEAD must descend from the tested candidate.",
    );
  }
  if ((input.mergeCommits ?? []).length > 0) {
    throw new Error(
      "Human review history must be linear and cannot contain merge commits.",
    );
  }
  if (input.testedCommit === input.currentCommit) return;

  const correctionPaths = input.changedPaths.filter(
    (path) => path !== reportRepositoryPath,
  );
  if (correctionPaths.length === 0) return;
  if (!input.manifestMatchesCurrentFingerprint) {
    throw new Error(
      "Post-evidence correction requires the manifest to match the current production fingerprint.",
    );
  }
  if (
    input.testedCommit !== approvedPostEvidenceCorrectionPreregistration ||
    (input.postEvidenceCorrectionCommits ?? []).length !== 1
  ) {
    throw new Error(
      "Human review permits exactly one approved post-evidence correction commit for this preregistration.",
    );
  }
  if (
    correctionPaths.some(
      (path) => !approvedPostEvidenceCorrectionPaths.has(path),
    )
  ) {
    throw new Error(
      "Human review permits only approved post-evidence correction paths.",
    );
  }
}

async function currentCleanCommit(): Promise<string> {
  const [{ stdout: status }, { stdout: commit }] = await Promise.all([
    execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"]),
    execFileAsync("git", ["rev-parse", "HEAD"]),
  ]);
  assertCleanCandidateStatus(status);
  return commit.trim();
}

function parseReport(markdown: string): ReleaseValidationReport | undefined {
  const match = dataPattern.exec(markdown);
  return match?.[1] === undefined
    ? undefined
    : JSON.parse(match[1]) as ReleaseValidationReport;
}

async function readExistingReport(): Promise<ReleaseValidationReport | undefined> {
  try {
    return parseReport(await readFile(reportUrl, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function parseRunManifest(contents: string): ReleaseRunManifest {
  const manifest = JSON.parse(contents) as Partial<ReleaseRunManifest>;
  const expectedKeys = [
    "candidateCommit",
    "createdAtUtc",
    "fixtureSetSha256",
    "instructionSha256",
    "plannedOAuthProbes",
    "plannedQualityCohorts",
    "schema",
    "target",
  ];
  if (
    Object.keys(manifest).sort().join(",") !== expectedKeys.join(",") ||
    manifest.schema !== 1 ||
    typeof manifest.createdAtUtc !== "string" ||
    typeof manifest.candidateCommit !== "string" ||
    !/^[0-9a-f]{40}$/u.test(manifest.candidateCommit) ||
    typeof manifest.instructionSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(manifest.instructionSha256) ||
    typeof manifest.fixtureSetSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(manifest.fixtureSetSha256) ||
    manifest.plannedOAuthProbes !== 1 ||
    manifest.plannedQualityCohorts !== 1 ||
    JSON.stringify(manifest.target) !==
      JSON.stringify({
        provider: RELEASE_TARGET.provider,
        model: RELEASE_TARGET.model,
        api: RELEASE_TARGET.api,
        baseUrl: RELEASE_TARGET.baseUrl,
        backend: RELEASE_TARGET.backend,
      })
  ) {
    throw new Error("The release-validation run manifest is invalid.");
  }
  return manifest as ReleaseRunManifest;
}

async function readExistingRunManifest(): Promise<ReleaseRunManifest | undefined> {
  try {
    return parseRunManifest(await readFile(manifestUrl, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function expectedRunManifest(
  candidateCommit: string,
  createdAtUtc: string,
): Promise<ReleaseRunManifest> {
  return createReleaseRunManifest({
    candidateCommit,
    createdAtUtc,
    instruction: TITLE_GENERATION_INSTRUCTION,
    fixtureSetContents: await readFile(fixtureUrl, "utf8"),
  });
}

async function assertCurrentManifestMatchesProductionFingerprint(
  preregistrationCommit: string,
): Promise<void> {
  let committedContents: string;
  try {
    ({ stdout: committedContents } = await execFileAsync("git", [
      "show",
      `HEAD:${manifestRepositoryPath}`,
    ]));
  } catch {
    throw new Error(
      "The committed release-validation run manifest is unavailable.",
    );
  }
  const workingContents = await readFile(manifestUrl, "utf8");
  if (workingContents.trimEnd() !== committedContents.trimEnd()) {
    throw new Error(
      "The release-validation run manifest must match committed HEAD.",
    );
  }
  const manifest = parseRunManifest(committedContents);
  const expected = await expectedRunManifest(
    manifest.candidateCommit,
    manifest.createdAtUtc,
  );
  if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
    throw new Error(
      "The release-validation run manifest does not match the current production fingerprint.",
    );
  }
  try {
    await execFileAsync("git", [
      "merge-base",
      "--is-ancestor",
      manifest.candidateCommit,
      "HEAD",
    ]);
  } catch {
    throw new Error("The run-manifest candidate must be an ancestor of HEAD.");
  }
  const { stdout: manifestCommitOutput } = await execFileAsync("git", [
    "log",
    "-1",
    "--format=%H",
    "HEAD",
    "--",
    manifestRepositoryPath,
  ]);
  if (manifestCommitOutput.trim() !== preregistrationCommit) {
    throw new Error(
      "Human review preregistration must match the committed run manifest.",
    );
  }
}

async function currentProductionCandidateCommit(): Promise<string> {
  const { stdout } = await execFileAsync("git", [
    "log",
    "-1",
    "--format=%H",
    "HEAD",
    "--",
    ".",
    `:(exclude)${reportRepositoryPath}`,
    `:(exclude)${manifestRepositoryPath}`,
  ]);
  const commit = stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error("Unable to identify the production candidate commit.");
  }
  return commit;
}

async function committedPreregistrationReport(
  testedCommit: string,
): Promise<ReleaseValidationReport> {
  let markdown: string;
  try {
    ({ stdout: markdown } = await execFileAsync("git", [
      "show",
      `${testedCommit}:${reportRepositoryPath}`,
    ]));
  } catch {
    throw new Error(
      "Commit the initial release report with the run manifest before a live gate.",
    );
  }
  const report = parseReport(markdown);
  if (
    report === undefined ||
    report.testedCommit !== "not-run" ||
    (report.oauthProbesStarted ?? 0) !== 0 ||
    (report.qualityCohortsStarted ?? 0) !== 0 ||
    report.quality.attempts.length !== 0
  ) {
    throw new Error(
      "The committed preregistration report must contain no started live evidence.",
    );
  }
  return report;
}

async function committedRunContext(): Promise<{
  manifest: ReleaseRunManifest;
  preregistrationReport: ReleaseValidationReport;
  testedCommit: string;
}> {
  let committedContents: string;
  try {
    ({ stdout: committedContents } = await execFileAsync("git", [
      "show",
      `HEAD:${manifestRepositoryPath}`,
    ]));
  } catch {
    throw new Error(
      "Commit the release-validation run manifest before a live gate.",
    );
  }
  const workingContents = await readFile(manifestUrl, "utf8");
  if (workingContents.trimEnd() !== committedContents.trimEnd()) {
    throw new Error(
      "The release-validation run manifest must match committed HEAD.",
    );
  }
  const manifest = parseRunManifest(committedContents);
  const expected = await expectedRunManifest(
    manifest.candidateCommit,
    manifest.createdAtUtc,
  );
  if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
    throw new Error(
      "The release-validation run manifest does not match the production instruction, fixtures, or target.",
    );
  }
  try {
    await execFileAsync("git", [
      "merge-base",
      "--is-ancestor",
      manifest.candidateCommit,
      "HEAD",
    ]);
  } catch {
    throw new Error("The run-manifest candidate must be an ancestor of HEAD.");
  }
  const { stdout: changed } = await execFileAsync("git", [
    "log",
    "-m",
    "--format=",
    "--name-only",
    `${manifest.candidateCommit}..HEAD`,
    "--",
  ]);
  const changedPaths = changed.split(/\r?\n/u).filter((path) => path !== "");
  if (
    changedPaths.some(
      (path) =>
        path !== reportRepositoryPath && path !== manifestRepositoryPath,
    )
  ) {
    throw new Error(
      "Only the committed run manifest and release report may follow the production candidate.",
    );
  }
  const { stdout: testedCommitOutput } = await execFileAsync("git", [
    "log",
    "-1",
    "--format=%H",
    "HEAD",
    "--",
    manifestRepositoryPath,
  ]);
  const testedCommit = testedCommitOutput.trim();
  if (!/^[0-9a-f]{40}$/u.test(testedCommit)) {
    throw new Error("Unable to identify the committed run-manifest revision.");
  }
  const preregistrationReport = await committedPreregistrationReport(
    testedCommit,
  );
  return { manifest, preregistrationReport, testedCommit };
}

async function baseReport(
  testedCommit: string,
): Promise<ReleaseValidationReport> {
  const generatedAtUtc = new Date().toISOString();
  const existing = await readExistingReport();
  if (
    existing !== undefined &&
    existing.testedCommit !== "not-run" &&
    (existing.preregistrationCommit ?? existing.testedCommit) !== testedCommit
  ) {
    throw new Error(
      "Recorded evidence belongs to a different commit; reset the report and run a fresh complete candidate validation.",
    );
  }
  if (existing === undefined) {
    throw new Error(
      "The preregistered release report is missing; prepare and commit it before live validation.",
    );
  }
  if (existing.testedCommit === "not-run") {
    return emptyReport(generatedAtUtc, testedCommit);
  }
  return { ...existing, generatedAtUtc };
}

async function writeManifestAtomically(
  manifest: ReleaseRunManifest,
): Promise<void> {
  const temporaryPath = join(
    dirname(manifestPath),
    `.${basename(manifestPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await rename(temporaryPath, manifestPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function writeReportAtomically(
  report: ReleaseValidationReport,
): Promise<void> {
  const temporaryPath = join(
    dirname(reportPath),
    `.${basename(reportPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, renderReleaseValidationReport(report), "utf8");
    await rename(temporaryPath, reportPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function withReportLock<T>(operation: () => Promise<T>): Promise<T> {
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Another release-validation command is already running.");
    }
    throw error;
  }
  try {
    return await operation();
  } finally {
    try {
      await lock.close();
    } finally {
      await rm(lockPath, { force: true });
    }
  }
}

export function assertHumanReviewMachineEvidenceUnchanged(
  committed: ReleaseValidationReport,
  edited: ReleaseValidationReport,
): void {
  if (
    committed.quality.attempts.some(
      (attempt) =>
        attempt.humanSemanticPassed !== null ||
        attempt.humanRationale !== null,
    )
  ) {
    throw new Error(
      "Machine evidence must be committed before human judgments are entered.",
    );
  }
  const withoutHumanReviewOrDerivedFields = (
    report: ReleaseValidationReport,
  ) => ({
    ...report,
    generatedAtUtc: null,
    oauth:
      report.oauth.assertions === null
        ? report.oauth
        : {
            ...report.oauth,
            classification: null,
            diagnostic: null,
          },
    quality: {
      ...report.quality,
      classification: null,
      diagnostic: null,
      attempts: report.quality.attempts.map((attempt) => ({
        ...attempt,
        humanSemanticPassed: null,
        humanRationale: null,
      })),
    },
    conclusion: null,
  });
  if (
    JSON.stringify(withoutHumanReviewOrDerivedFields(committed)) !==
    JSON.stringify(withoutHumanReviewOrDerivedFields(edited))
  ) {
    throw new Error(
      "Human review machine evidence must match the committed live run.",
    );
  }
}

export function finalizeHumanReviewReport(
  report: ReleaseValidationReport,
  fixtures: readonly ReleaseFixture[],
): ReleaseValidationReport {
  if (report.quality.attempts.length !== 36) {
    throw new Error("Human review requires one complete 36-attempt quality run.");
  }
  const attempts = recomputeHumanReviewedAttempts(
    report.quality.attempts,
    fixtures,
  );
  if (
    attempts.some(
      (attempt) =>
        attempt.classification !== "pass" ||
        !attempt.hardValidationPassed ||
        !attempt.forbiddenDetailsPassed ||
        !attempt.injectionPassed,
    )
  ) {
    throw new Error(
      "Human review cannot begin until every mandatory machine gate passes.",
    );
  }
  if (
    attempts.some(
      (attempt) =>
        typeof attempt.humanSemanticPassed !== "boolean" ||
        typeof attempt.humanRationale !== "string" ||
        attempt.humanRationale.trim() === "",
    )
  ) {
    throw new Error(
      "Every quality attempt requires a human pass/fail judgment and non-empty rationale.",
    );
  }

  const classification = qualityGateClassification(attempts);
  const quality = {
    classification,
    diagnostic:
      classification === "pass" ? null : "quality-threshold-failed" as const,
    attempts,
  };
  const oauth = recomputeOAuthValidation(report.oauth);
  const recomputed = {
    ...report,
    oauth,
    quality,
    conclusion: releaseGateConclusion({ oauth, quality: attempts }),
  };
  if (JSON.stringify(recomputed) === JSON.stringify(report)) return report;
  return {
    ...recomputed,
    generatedAtUtc: new Date().toISOString(),
  };
}

export async function beginOAuthValidation(): Promise<ReleaseValidationReport> {
  await currentCleanCommit();
  const {
    manifest,
    preregistrationReport,
    testedCommit,
  } = await committedRunContext();
  return withReportLock(async () => {
    const existing = await readExistingReport();
    if (JSON.stringify(existing) !== JSON.stringify(preregistrationReport)) {
      throw new Error(
        "The first live gate requires the working release report to match its committed preregistration.",
      );
    }
    const report = await baseReport(testedCommit);
    assertOAuthProbeAvailable(report, manifest);
    await reserveRunMarker(manifest, "oauth");
    const oauth: OAuthValidationResult = {
      classification: "environmental/inconclusive",
      diagnostic: "provider-request-failed",
      assertions: null,
    };
    const updated: ReleaseValidationReport = {
      ...report,
      testedCommit: manifest.candidateCommit,
      candidateCommit: manifest.candidateCommit,
      preregistrationCommit: testedCommit,
      oauthProbesStarted: (report.oauthProbesStarted ?? 0) + 1,
      oauthProbeCompleted: false,
      oauth,
      conclusion: releaseGateConclusion({
        oauth,
        quality: report.quality.attempts,
      }),
    };
    await writeReportAtomically(updated);
    return updated;
  });
}

export async function recordOAuthValidation(
  oauth: OAuthValidationResult,
): Promise<ReleaseValidationReport> {
  await currentCleanCommit();
  const { testedCommit } = await committedRunContext();
  return withReportLock(async () => {
    const report = await baseReport(testedCommit);
    if ((report.oauthProbesStarted ?? 0) !== 1 || report.oauthProbeCompleted) {
      throw new Error("No unfinished preregistered OAuth probe is available.");
    }
    const updated: ReleaseValidationReport = {
      ...report,
      oauthProbeCompleted: true,
      oauth,
      conclusion: releaseGateConclusion({
        oauth,
        quality: report.quality.attempts,
      }),
    };
    await writeReportAtomically(updated);
    return updated;
  });
}

export async function beginQualityValidation(): Promise<ReleaseValidationReport> {
  await currentCleanCommit();
  const { manifest, testedCommit } = await committedRunContext();
  return withReportLock(async () => {
    const report = await baseReport(testedCommit);
    if (!report.oauthProbeCompleted || report.oauth.classification !== "pass") {
      throw new Error(
        "The preregistered OAuth probe must pass before the quality cohort starts.",
      );
    }
    assertQualityCohortAvailable(report, manifest);
    await reserveRunMarker(manifest, "quality");
    const quality: QualityValidationResult = {
      classification: "environmental/inconclusive",
      diagnostic: "provider-request-failed",
      attempts: [],
    };
    const updated: ReleaseValidationReport = {
      ...report,
      qualityCohortsStarted: (report.qualityCohortsStarted ?? 0) + 1,
      qualityCohortCompleted: false,
      quality,
      conclusion: releaseGateConclusion({
        oauth: report.oauth,
        quality: quality.attempts,
      }),
    };
    await writeReportAtomically(updated);
    return updated;
  });
}

export async function checkpointQualityValidation(
  attempts: readonly QualityAttemptRecord[],
): Promise<ReleaseValidationReport> {
  await currentCleanCommit();
  const { testedCommit } = await committedRunContext();
  return withReportLock(async () => {
    const report = await baseReport(testedCommit);
    if (
      (report.qualityCohortsStarted ?? 0) !== 1 ||
      report.qualityCohortCompleted
    ) {
      throw new Error("No unfinished preregistered quality cohort is available.");
    }
    assertQualityCheckpointProgress(report.quality.attempts, attempts);
    const quality: QualityValidationResult = {
      classification: "environmental/inconclusive",
      diagnostic: "provider-request-failed",
      attempts: [...attempts],
    };
    const updated: ReleaseValidationReport = {
      ...report,
      quality,
      conclusion: releaseGateConclusion({
        oauth: report.oauth,
        quality: quality.attempts,
      }),
    };
    await writeReportAtomically(updated);
    return updated;
  });
}

export async function recordQualityValidation(
  quality: QualityValidationResult,
): Promise<ReleaseValidationReport> {
  await currentCleanCommit();
  const { testedCommit } = await committedRunContext();
  return withReportLock(async () => {
    const report = await baseReport(testedCommit);
    if (
      (report.qualityCohortsStarted ?? 0) !== 1 ||
      report.qualityCohortCompleted
    ) {
      throw new Error("No unfinished preregistered quality cohort is available.");
    }
    const retainedQuality =
      quality.attempts.length === 0 && report.quality.attempts.length > 0
        ? { ...quality, attempts: report.quality.attempts }
        : quality;
    if (
      retainedQuality.attempts.length > 0 &&
      JSON.stringify(retainedQuality.attempts) !==
        JSON.stringify(report.quality.attempts)
    ) {
      throw new Error("Final quality evidence must match retained checkpoints.");
    }
    const updated: ReleaseValidationReport = {
      ...report,
      qualityCohortCompleted: true,
      quality: retainedQuality,
      conclusion: releaseGateConclusion({
        oauth: report.oauth,
        quality: retainedQuality.attempts,
      }),
    };
    await writeReportAtomically(updated);
    return updated;
  });
}

async function assertRecordedCandidateHistory(
  testedCommit: string,
  currentCommit: string,
): Promise<void> {
  if (!/^[0-9a-f]{40}$/u.test(testedCommit)) {
    throw new Error("Recorded validation has an invalid tested commit.");
  }

  let testedCommitIsAncestor = true;
  try {
    await execFileAsync("git", [
      "merge-base",
      "--is-ancestor",
      testedCommit,
      currentCommit,
    ]);
  } catch {
    testedCommitIsAncestor = false;
  }

  let changedPaths: string[] = [];
  let mergeCommits: string[] = [];
  let postEvidenceCorrectionCommits: string[] = [];
  if (testedCommitIsAncestor) {
    const [
      { stdout: paths },
      { stdout: merges },
      { stdout: correctionCommits },
    ] = await Promise.all([
      execFileAsync("git", [
        "-c",
        "diff.renames=false",
        "log",
        "--no-renames",
        "-m",
        "--format=",
        "--name-only",
        "-z",
        `${testedCommit}..${currentCommit}`,
        "--",
      ]),
      execFileAsync("git", [
        "rev-list",
        "--min-parents=2",
        `${testedCommit}..${currentCommit}`,
      ]),
      execFileAsync("git", [
        "log",
        "--format=%H",
        `${testedCommit}..${currentCommit}`,
        "--",
        ".",
        `:(exclude)${reportRepositoryPath}`,
      ]),
    ]);
    changedPaths = paths.split("\0").filter((path) => path !== "");
    mergeCommits = merges.split(/\r?\n/u).filter((commit) => commit !== "");
    postEvidenceCorrectionCommits = correctionCommits
      .split(/\r?\n/u)
      .filter((commit) => /^[0-9a-f]{40}$/u.test(commit));
  }
  assertHumanReviewCandidateHistory({
    testedCommit,
    currentCommit,
    testedCommitIsAncestor,
    changedPaths,
    mergeCommits,
    postEvidenceCorrectionCommits,
    manifestMatchesCurrentFingerprint: true,
  });
}

export function selectUniqueCommittedMachineReport(
  reports: readonly ReleaseValidationReport[],
): ReleaseValidationReport {
  const candidates = reports.filter(
    (report) =>
      report.oauthProbesStarted === 1 &&
      report.oauthProbeCompleted === true &&
      report.qualityCohortsStarted === 1 &&
      report.qualityCohortCompleted === true &&
      report.quality.attempts.length === 36 &&
      report.quality.attempts.every(
        (attempt) =>
          attempt.attemptCompleted &&
          attempt.humanSemanticPassed === null &&
          attempt.humanRationale === null,
      ),
  );
  if (candidates.length !== 1) {
    throw new Error(
      "Human review requires exactly one committed pre-human machine baseline.",
    );
  }
  return candidates[0] as ReleaseValidationReport;
}

async function readCommittedMachineReport(
  testedCommit: string,
  currentCommit: string,
): Promise<ReleaseValidationReport> {
  const { stdout: history } = await execFileAsync("git", [
    "log",
    "--reverse",
    "--format=%H",
    `${testedCommit}..${currentCommit}`,
    "--",
    reportRepositoryPath,
  ]);
  const evidenceCommits = history
    .split(/\r?\n/u)
    .filter((line) => /^[0-9a-f]{40}$/u.test(line));
  const reports: ReleaseValidationReport[] = [];
  for (const evidenceCommit of evidenceCommits) {
    const { stdout: markdown } = await execFileAsync("git", [
      "show",
      `${evidenceCommit}:${reportRepositoryPath}`,
    ]);
    const report = parseReport(markdown);
    if (
      report !== undefined &&
      (report.preregistrationCommit ?? report.testedCommit) === testedCommit
    ) {
      reports.push(report);
    }
  }
  return selectUniqueCommittedMachineReport(reports);
}

export async function finalizeRecordedHumanReview(): Promise<ReleaseValidationReport> {
  const currentCommit = await currentCleanCommit();
  return withReportLock(async () => {
    const report = await readExistingReport();
    if (report === undefined || report.testedCommit === "not-run") {
      throw new Error(
        "Human review must match a recorded validation run for the candidate.",
      );
    }
    const preregistrationCommit =
      report.preregistrationCommit ?? report.testedCommit;
    await assertCurrentManifestMatchesProductionFingerprint(
      preregistrationCommit,
    );
    await assertRecordedCandidateHistory(preregistrationCommit, currentCommit);
    const committed = await readCommittedMachineReport(
      preregistrationCommit,
      currentCommit,
    );
    assertHumanReviewMachineEvidenceUnchanged(committed, report);
    const fixtureContents = await readFile(
      new URL(
        "../docs/research/title-quality-fixtures.json",
        import.meta.url,
      ),
      "utf8",
    );
    const fixtures = JSON.parse(fixtureContents) as ReleaseFixture[];
    const updated = finalizeHumanReviewReport(report, fixtures);
    await writeReportAtomically(updated);
    return updated;
  });
}

export async function writeInitialReport(): Promise<void> {
  await currentCleanCommit();
  const candidateCommit = await currentProductionCandidateCommit();
  const createdAtUtc = new Date().toISOString();
  const nextManifest = await expectedRunManifest(
    candidateCommit,
    createdAtUtc,
  );
  await assertNoRunMarkers(nextManifest);
  await withReportLock(async () => {
    const [existingReport, existingManifest] = await Promise.all([
      readExistingReport(),
      readExistingRunManifest(),
    ]);
    assertExistingEvidencePair(existingReport, existingManifest);
    if (existingReport !== undefined && existingManifest !== undefined) {
      assertResetAllowed({
        existingReport,
        existingManifest,
        nextManifest,
      });
    }
    const report = await emptyReport("not-run", "not-run");
    await writeManifestAtomically(nextManifest);
    await writeReportAtomically(report);
  });
}
