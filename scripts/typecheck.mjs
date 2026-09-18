import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import './generate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
for (const project of [
  'tsconfig.json',
  ...['introductory-app', 'test-shell', 'discovery-app', 'geology-app'].map(
    (name) => `fixtures/${name}/tsconfig.json`,
  ),
]) {
  const result = spawnSync(
    process.execPath,
    [require.resolve('typescript/bin/tsc'), '--noEmit', '-p', project],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
