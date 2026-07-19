import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "npm_execpath is required for package verification");
const result = spawnSync(
  process.execPath,
  [npmCli, "pack", "--dry-run", "--json"],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
  },
);
assert.equal(result.status, 0, `npm pack verification failed:\n${result.stderr}`);

const reports = JSON.parse(result.stdout);
assert.equal(reports.length, 1, "expected one npm pack report");
const [report] = reports;
assert.deepEqual(report.bundled, []);

const actualFiles = report.files.map(({ path }) => path).sort();
const expectedFiles = [
  "README.md",
  "package.json",
  "src/attempt.ts",
  "src/configuration.ts",
  "src/index.ts",
  "src/lifecycle.ts",
  "src/title.ts",
  "src/warnings.ts",
].sort();
assert.deepEqual(actualFiles, expectedFiles);

console.log("Pi package contents and dependency boundary verification passed");
