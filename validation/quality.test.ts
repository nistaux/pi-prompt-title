import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createLiveValidationCapabilities } from "./live-runtime.js";
import {
  beginQualityValidation,
  checkpointQualityValidation,
  recordQualityValidation,
} from "./report-store.js";
import {
  createQualityAttemptPlan,
  runQualityValidation,
  type QualityValidationResult,
  type ReleaseFixture,
} from "./release-validation.js";

async function retainedFixtures(): Promise<ReleaseFixture[]> {
  const contents = await readFile(
    new URL(
      "../docs/research/title-quality-fixtures.json",
      import.meta.url,
    ),
    "utf8",
  );
  return JSON.parse(contents) as ReleaseFixture[];
}

describe("credential-gated representative title-quality validation", () => {
  it("records exactly three isolated sequential attempts for each retained fixture", async () => {
    await beginQualityValidation();
    const fixtures = await retainedFixtures();
    expect(fixtures, "The retained fixture set must contain exactly 12 inputs.")
      .toHaveLength(12);
    expect(createQualityAttemptPlan(fixtures, 3)).toHaveLength(36);

    let result: QualityValidationResult;
    try {
      const capabilities = await createLiveValidationCapabilities();
      result = await runQualityValidation(
        fixtures,
        3,
        capabilities.registry,
        capabilities.complete,
        async (attempts) => {
          await checkpointQualityValidation(attempts);
        },
      );
    } catch {
      result = {
        classification: "environmental/inconclusive",
        diagnostic: "provider-request-failed",
        attempts: [],
      };
    }

    await recordQualityValidation(result);

    if (result.classification === "skip") {
      console.warn("SKIP: ChatGPT OAuth authentication is unavailable.");
      return;
    }
    if (
      result.attempts.length !== 36 ||
      result.attempts.some(
        (attempt) =>
          attempt.classification === "environmental/inconclusive" ||
          attempt.classification === "skip",
      )
    ) {
      throw new Error("Quality validation was environmental/inconclusive.");
    }
    if (
      result.classification === "fail" ||
      result.attempts.some((attempt) => attempt.classification === "fail")
    ) {
      throw new Error("Quality validation machine policy failed.");
    }

    expect(result.attempts).toHaveLength(36);
    expect(
      result.attempts.every(
        (attempt) =>
          attempt.humanSemanticPassed === null &&
          attempt.humanRationale === null,
      ),
    ).toBe(true);
    console.log(
      "RECORDED: 36 synthetic titles; human semantic review remains pending.",
    );
  }, 10 * 60_000);
});
