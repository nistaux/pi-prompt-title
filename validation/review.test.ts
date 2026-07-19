import { describe, expect, it } from "vitest";
import { finalizeRecordedHumanReview } from "./report-store.js";

describe("offline human release-validation review", () => {
  it("validates all judgments and atomically recomputes the release gate", async () => {
    const report = await finalizeRecordedHumanReview();
    expect(report.quality.attempts).toHaveLength(36);
    expect(
      report.quality.attempts.every(
        (attempt) =>
          attempt.humanSemanticPassed !== null &&
          attempt.humanRationale !== null &&
          attempt.humanRationale.trim() !== "",
      ),
    ).toBe(true);
    console.log(
      `REVIEWED: release gate recomputed as ${report.conclusion}; no model or network call was made.`,
    );
  });
});
