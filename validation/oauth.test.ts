import { describe, expect, it } from "vitest";
import { createLiveValidationCapabilities } from "./live-runtime.js";
import { recordOAuthValidation } from "./report-store.js";
import {
  runOAuthProbe,
  type OAuthValidationResult,
} from "./release-validation.js";

describe("credential-gated ChatGPT OAuth release validation", () => {
  it("uses the production full-completion path with explicit no reasoning", async () => {
    let result: OAuthValidationResult;
    try {
      const capabilities = await createLiveValidationCapabilities();
      result = await runOAuthProbe(
        capabilities.registry,
        capabilities.complete,
      );
    } catch {
      result = {
        classification: "environmental/inconclusive",
        diagnostic: "provider-request-failed",
        assertions: null,
      };
    }

    await recordOAuthValidation(result);

    if (result.classification === "skip") {
      console.warn("SKIP: ChatGPT OAuth authentication is unavailable.");
      return;
    }
    if (result.classification === "environmental/inconclusive") {
      throw new Error("OAuth validation was environmental/inconclusive.");
    }
    expect(result.classification, "OAuth backend contract failed.").toBe(
      "pass",
    );
    console.log("PASS: explicit no-reasoning ChatGPT OAuth probe passed.");
  }, 30_000);
});
