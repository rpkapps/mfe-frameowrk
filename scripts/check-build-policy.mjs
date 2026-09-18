import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const expectedVersion = manifest.packageManager.replace(/^pnpm@/, '');
const executable = process.env.PNPM_EXECUTABLE ?? process.env.npm_execpath;
const runner = executable
  ? /\.[cm]?js$/.test(executable)
    ? { command: process.execPath, args: [executable] }
    : { command: executable, args: [] }
  : { command: 'corepack', args: [`pnpm@${expectedVersion}`] };

function runPnpm(args, cwd) {
  const result = spawnSync(runner.command, [...runner.args, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    timeout: 90_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, `pnpm terminated with ${result.signal}`);
  return { status: result.status, stdout: result.stdout, output: result.stdout + result.stderr };
}

function requireSuccess(result, operation) {
  assert.equal(result.status, 0, `${operation} failed:\n${result.output}`);
}

const version = runPnpm(['--version'], root);
requireSuccess(version, 'Read pnpm version');
assert.equal(
  version.stdout.trim(),
  expectedVersion,
  `Use pnpm ${expectedVersion}; set PNPM_EXECUTABLE to its executable when using a separately installed runner.`,
);

const temporaryRoot = await mkdtemp(join(root, 'node_modules/.mfe-build-policy-'));
const artifactDirectory = join(temporaryRoot, 'artifacts');
await mkdir(artifactDirectory);

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function checkFixture({ name, approval }) {
  const packageName = `@company/mfe-build-policy-${name}`;
  const packageVersion = '1.0.0';
  const packageDirectory = join(temporaryRoot, `${name}-package`);
  const consumerDirectory = join(temporaryRoot, `${name}-consumer`);
  const tarballName = `company-mfe-build-policy-${name}-${packageVersion}.tgz`;
  const tarballPath = join(artifactDirectory, tarballName);
  const dependencyPath = `file:../artifacts/${tarballName}`;
  const markerName = 'install-script-ran.txt';

  await mkdir(packageDirectory);
  await mkdir(consumerDirectory);
  await writeJson(join(packageDirectory, 'package.json'), {
    name: packageName,
    version: packageVersion,
    packageManager: manifest.packageManager,
    files: ['install.cjs'],
    scripts: { postinstall: 'node install.cjs' },
  });
  // The reviewed fixture has no dependencies, network access, or arbitrary commands.
  // Its only effect is a fixed marker inside its own installed package directory.
  await writeFile(
    join(packageDirectory, 'install.cjs'),
    `require('node:fs').writeFileSync(require('node:path').join(__dirname, '${markerName}'), '${packageName}@${packageVersion}\\n')\n`,
  );
  await writeFile(
    join(packageDirectory, 'pnpm-workspace.yaml'),
    'packages: []\nstrictDepBuilds: true\ndangerouslyAllowAllBuilds: false\nallowBuilds: {}\n',
  );
  requireSuccess(runPnpm(['pack', '--out', tarballPath], packageDirectory), `Pack ${packageName}`);
  assert.ok(existsSync(tarballPath), 'Packing must produce a real tarball');
  assert.ok(!existsSync(join(packageDirectory, markerName)), 'Packing must not run postinstall');

  await writeJson(join(consumerDirectory, 'package.json'), {
    name: `mfe-build-policy-${name}-consumer`,
    private: true,
    packageManager: manifest.packageManager,
    dependencies: { [packageName]: dependencyPath },
  });
  // Tarballs require their complete resolved artifact identity, not a registry
  // name/version matcher. The exact reviewed fixture version is in this path.
  const allowance =
    approval === undefined
      ? 'allowBuilds: {}'
      : `allowBuilds:\n  '${packageName}@${dependencyPath}': ${approval}`;
  await writeFile(
    join(consumerDirectory, 'pnpm-workspace.yaml'),
    `packages: []\nstrictDepBuilds: true\ndangerouslyAllowAllBuilds: false\n${allowance}\n`,
  );

  // Each install gets an empty content store; no cached build can masquerade as
  // successful execution or bypass the unreviewed-script assertion.
  const storeDirectory = join(consumerDirectory, 'store');
  const args = ['install', '--offline', '--store-dir', storeDirectory, '--reporter', 'append-only'];
  requireSuccess(
    runPnpm([...args, '--lockfile-only', '--no-frozen-lockfile'], consumerDirectory),
    `Generate fixture lockfile for ${name}`,
  );
  const result = runPnpm([...args, '--frozen-lockfile'], consumerDirectory);
  const markerPath = resolve(consumerDirectory, 'node_modules', packageName, markerName);

  if (approval === undefined) {
    assert.notEqual(result.status, 0, 'Unreviewed build scripts must fail installation');
    assert.match(result.output, /ERR_PNPM_IGNORED_BUILDS/, result.output);
    assert.match(result.output, new RegExp(packageName), result.output);
    assert.ok(!existsSync(markerPath), 'The unreviewed install script must not execute');
    console.log('PASS unreviewed: installation rejected; script did not execute');
    return;
  }

  requireSuccess(result, `Install ${name} fixture`);
  if (approval) {
    assert.equal(await readFile(markerPath, 'utf8'), `${packageName}@${packageVersion}\n`);
    console.log('PASS approved: exact reviewed artifact installed; script executed');
  } else {
    assert.ok(!existsSync(markerPath), 'An explicitly denied script must not execute');
    console.log('PASS denied: installation succeeded; script did not execute');
  }
}

try {
  await checkFixture({ name: 'unreviewed' });
  await checkFixture({ name: 'approved', approval: true });
  await checkFixture({ name: 'denied', approval: false });
  console.log(`Dependency build policy verified with pnpm ${expectedVersion}.`);
} finally {
  // Delete only the unique directory this invocation created.
  await rm(temporaryRoot, { recursive: true, force: true });
}
