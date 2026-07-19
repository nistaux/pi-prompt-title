import { execFile } from "node:child_process";
import { open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  RELEASE_TARGET,
  qualityGateClassification,
  releaseGateConclusion,
  renderReleaseValidationReport,
  type OAuthValidationResult,
  type QualityValidationResult,
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

  const classification = qualityGateClassification(report.quality.attempts);
  const quality = {
    ...report.quality,
    classification,
    diagnostic:
      classification === "pass" ? null : "quality-threshold-failed" as const,
  };
  return {
    ...report,
    generatedAtUtc: new Date().toISOString(),
    quality,
    conclusion: releaseGateConclusion({
      oauth: report.oauth,
      quality: quality.attempts,
    }),
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

export async function finalizeRecordedHumanReview(): Promise<ReleaseValidationReport> {
  const testedCommit = await currentCleanCommit();
  return withReportLock(async () => {
    const report = await readExistingReport();
    if (report === undefined || report.testedCommit !== testedCommit) {
      throw new Error(
        "Human review must match a recorded validation run for the clean HEAD candidate.",
      );
    }
    const updated = finalizeHumanReviewReport(report);
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
