import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

function binary(packageName, name) {
  const manifestPath = require.resolve(`${packageName}/package.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const relativePath = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[name];
  if (typeof relativePath !== 'string') {
    throw new Error(`The pinned ${packageName} package does not declare its ${name} executable.`);
  }
  return join(dirname(manifestPath), relativePath);
}

// Run the installed tools directly. Recursing through a bare `pnpm` could select
// a different global version than the exact Corepack invocation that started us.
const checks = [
  ['generation', ['scripts/generate.mjs']],
  ['Tecton distribution integrity', ['scripts/prepare-tecton.mjs', '--check']],
  ['formatting', [binary('prettier', 'prettier'), '--check', '.']],
  ['lint', [binary('eslint', 'eslint'), '.']],
  ['framework types', [binary('typescript', 'tsc'), '--noEmit']],
  [
    'App types',
    [binary('typescript', 'tsc'), '--noEmit', '-p', 'fixtures/introductory-app/tsconfig.json'],
  ],
  ...['test-shell', 'discovery-app', 'geology-app'].map((fixture) => [
    `${fixture} types`,
    [binary('typescript', 'tsc'), '--noEmit', '-p', `fixtures/${fixture}/tsconfig.json`],
  ]),
  ['package boundaries', ['scripts/check-boundaries.mjs']],
  ['behavior tests', [binary('vitest', 'vitest'), 'run']],
  ['dependency build policy', ['scripts/check-build-policy.mjs']],
];

for (const [name, args] of checks) {
  console.log(`Checking ${name}...`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${name} terminated with ${result.signal}.`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
