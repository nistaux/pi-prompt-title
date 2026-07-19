import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type PackageJson = {
  keywords?: string[];
  pi?: { extensions?: string[] };
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
};

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as PackageJson;

describe("Pi package manifest", () => {
  it("declares the extension for Pi discovery", () => {
    expect(packageJson.keywords).toContain("pi-package");
    expect(packageJson.pi?.extensions).toEqual(["./src/index.ts"]);
  });

  it("uses Pi core packages as unbundled peers while testing exactly 0.80.10", () => {
    expect(packageJson.peerDependencies).toMatchObject({
      "@earendil-works/pi-ai": "*",
      "@earendil-works/pi-coding-agent": "*",
    });
    expect(packageJson.devDependencies).toMatchObject({
      "@earendil-works/pi-ai": "0.80.10",
      "@earendil-works/pi-coding-agent": "0.80.10",
    });
    expect(packageJson.engines?.node).toBe(">=22.19.0");
  });

  it("publishes deterministic offline development commands", () => {
    expect(packageJson.scripts).toMatchObject({
      test: "vitest run --dir test",
      typecheck: "tsc --noEmit",
      smoke: "node scripts/smoke.mjs",
    });
  });

  it("keeps credential-gated release checks outside deterministic commands", () => {
    expect(packageJson.scripts).toMatchObject({
      "validate:oauth": "vitest run validation/oauth.test.ts",
      "validate:quality": "vitest run validation/quality.test.ts",
      "validate:review": "vitest run validation/review.test.ts",
      "validate:reset": "vitest run validation/reset.test.ts",
    });
    expect(packageJson.scripts?.test).not.toContain("validation/");
    expect(packageJson.scripts?.check).not.toContain("validate:");
  });
});
