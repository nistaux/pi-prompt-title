import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const isolationMarker = "PI_PROMPT_TITLE_SMOKE_ISOLATED";
const essentialEnvironmentNames = new Set([
  "COMSPEC",
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "WINDIR",
]);

function createIsolatedEnvironment() {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      essentialEnvironmentNames.has(name.toUpperCase()),
    ),
  );
  environment[isolationMarker] = "1";
  return environment;
}

async function runIsolatedSmoke() {
  for (const credentialName of [
    "AWS_ACCESS_KEY_ID",
    "GITHUB_PAT",
    "AZURE_CLIENT_CERTIFICATE_PATH",
  ]) {
    assert.equal(
      process.env[credentialName],
      undefined,
      `${credentialName} must not enter the isolated smoke process`,
    );
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "pi-prompt-title-smoke-"));
  const cleanCheckout = join(temporaryRoot, "checkout");
  const agentDir = join(temporaryRoot, "agent");
  const workspace = join(temporaryRoot, "workspace");

  Object.assign(process.env, {
    HOME: temporaryRoot,
    USERPROFILE: temporaryRoot,
    PI_CODING_AGENT_DIR: agentDir,
    PI_OFFLINE: "1",
    PI_SKIP_VERSION_CHECK: "1",
  });

  const { DefaultResourceLoader, getPackageDir } = await import(
    "@earendil-works/pi-coding-agent"
  );
  const piPackageRoot = getPackageDir();
  const piPackage = JSON.parse(
    await readFile(join(piPackageRoot, "package.json"), "utf8"),
  );
  assert.equal(piPackage.version, "0.80.10");

  try {
    await Promise.all([
      mkdir(cleanCheckout, { recursive: true }),
      mkdir(agentDir, { recursive: true }),
      mkdir(workspace, { recursive: true }),
    ]);

    const safeRepositoryPath = repositoryRoot.replaceAll("\\", "/");
    const gitRepositoryArguments = ["-c", `safe.directory=${safeRepositoryPath}`];
    const checkout = spawnSync(
      "git",
      [
        ...gitRepositoryArguments,
        "checkout-index",
        "--all",
        `--prefix=${cleanCheckout}${sep}`,
      ],
      {
        cwd: repositoryRoot,
        env: process.env,
        encoding: "utf8",
      },
    );
    assert.equal(
      checkout.status,
      0,
      `clean checkout from Git index failed:\n${checkout.stderr}`,
    );

    const trackedFiles = spawnSync(
      "git",
      [...gitRepositoryArguments, "ls-files", "-z"],
      {
        cwd: repositoryRoot,
        env: process.env,
        encoding: "utf8",
      },
    );
    assert.equal(
      trackedFiles.status,
      0,
      `listing tracked files failed:\n${trackedFiles.stderr}`,
    );
    await Promise.all(
      trackedFiles.stdout
        .split("\0")
        .filter(Boolean)
        .map((path) => access(join(cleanCheckout, path))),
    );
    await assert.rejects(access(join(cleanCheckout, "node_modules")));

    const piCli = join(piPackageRoot, "dist", "cli.js");
    const installation = spawnSync(
      process.execPath,
      [piCli, "install", cleanCheckout],
      {
        cwd: workspace,
        env: process.env,
        encoding: "utf8",
      },
    );
    assert.equal(
      installation.status,
      0,
      `isolated local-path install failed:\n${installation.stderr}`,
    );

    const settings = JSON.parse(
      await readFile(join(agentDir, "settings.json"), "utf8"),
    );
    assert.equal(settings.packages.length, 1);
    assert.equal(resolve(agentDir, settings.packages[0]), cleanCheckout);

    const loader = new DefaultResourceLoader({
      cwd: workspace,
      agentDir,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    const loaded = loader.getExtensions();

    assert.deepEqual(loaded.errors, []);
    assert.equal(loaded.extensions.length, 1);
    const [extension] = loaded.extensions;
    assert.ok(extension, "expected Pi to load the manifest extension");
    assert.equal(extension.handlers.size, 0);
    assert.equal(extension.tools.size, 0);
    assert.equal(extension.commands.size, 0);
    assert.equal(extension.flags.size, 0);
    assert.equal(extension.shortcuts.size, 0);
    assert.equal(extension.messageRenderers.size, 0);
    assert.equal(extension.entryRenderers?.size ?? 0, 0);

    console.log("Pi 0.80.10 isolated local-path discovery/load smoke passed");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.env[isolationMarker] === "1") {
  await runIsolatedSmoke();
} else {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: repositoryRoot,
    env: createIsolatedEnvironment(),
    encoding: "utf8",
  });
  assert.equal(
    child.status,
    0,
    `isolated smoke child failed:\n${child.stderr}`,
  );
  process.stdout.write(child.stdout);
}
