import { execFile } from "node:child_process";
import { open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  RELEASE_TARGET,
  qualityGateClassification,
  recomputeHumanReviewedAttempts,
  recomputeOAuthValidation,
  releaseGateConclusion,
  renderReleaseValidationReport,
  type OAuthValidationResult,
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
const lockPath = `${reportPath}.lock`;
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
}): void {
  if (input.testedCommit === input.currentCommit) return;
  if (!input.testedCommitIsAncestor) {
    throw new Error(
      "Human review HEAD must descend from the tested candidate.",
    );
  }
  if (input.changedPaths.some((path) => path !== reportRepositoryPath)) {
    throw new Error(
      "Human review permits only release-report commits after the tested candidate.",
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

async function readExistingReport(): Promise<ReleaseValidationReport | undefined> {
  try {
    const markdown = await readFile(reportUrl, "utf8");
    const match = dataPattern.exec(markdown);
    if (match?.[1] === undefined) return undefined;
    return JSON.parse(match[1]) as ReleaseValidationReport;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function baseReport(
  testedCommit: string,
): Promise<ReleaseValidationReport> {
  const generatedAtUtc = new Date().toISOString();
  const existing = await readExistingReport();
  if (
    existing !== undefined &&
    existing.testedCommit !== "not-run" &&
    existing.testedCommit !== testedCommit
  ) {
    throw new Error(
      "Recorded evidence belongs to a different commit; reset the report and run a fresh complete candidate validation.",
    );
  }
  if (existing === undefined || existing.testedCommit === "not-run") {
    return emptyReport(generatedAtUtc, testedCommit);
  }
  return { ...existing, generatedAtUtc };
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

export function finalizeHumanReviewReport(
  report: ReleaseValidationReport,
  fixtures: readonly ReleaseFixture[],
): ReleaseValidationReport {
  if (report.quality.attempts.length !== 36) {
    throw new Error("Human review requires one complete 36-attempt quality run.");
  }
  if (
    report.quality.attempts.some(
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

  const attempts = recomputeHumanReviewedAttempts(
    report.quality.attempts,
    fixtures,
  );
  const classification = qualityGateClassification(attempts);
  const quality = {
    classification,
    diagnostic:
      classification === "pass" ? null : "quality-threshold-failed" as const,
    attempts,
  };
  const oauth = recomputeOAuthValidation(report.oauth);
  return {
    ...report,
    generatedAtUtc: new Date().toISOString(),
    oauth,
    quality,
    conclusion: releaseGateConclusion({ oauth, quality: attempts }),
  };
}

export async function recordOAuthValidation(
  oauth: OAuthValidationResult,
): Promise<ReleaseValidationReport> {
  const testedCommit = await currentCleanCommit();
  return withReportLock(async () => {
    const report = await baseReport(testedCommit);
    const updated: ReleaseValidationReport = {
      ...report,
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

export async function recordQualityValidation(
  quality: QualityValidationResult,
): Promise<ReleaseValidationReport> {
  const testedCommit = await currentCleanCommit();
  return withReportLock(async () => {
    const report = await baseReport(testedCommit);
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

async function assertRecordedCandidateHistory(
  testedCommit: string,
  currentCommit: string,
): Promise<void> {
  if (testedCommit === currentCommit) return;
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
  if (testedCommitIsAncestor) {
    const { stdout } = await execFileAsync("git", [
      "log",
      "--format=",
      "--name-only",
      `${testedCommit}..${currentCommit}`,
      "--",
    ]);
    changedPaths = stdout.split(/\r?\n/u).filter((path) => path !== "");
  }
  assertHumanReviewCandidateHistory({
    testedCommit,
    currentCommit,
    testedCommitIsAncestor,
    changedPaths,
  });
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
    await assertRecordedCandidateHistory(report.testedCommit, currentCommit);
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
  await withReportLock(async () => {
    const report = await emptyReport("not-run", "not-run");
    await writeReportAtomically(report);
  });
}
