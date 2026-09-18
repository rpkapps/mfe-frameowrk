import { createServer } from 'node:net';
import { join } from 'node:path';
import { createRsbuild } from '@rsbuild/core';
import { applications, configuration, workspace } from './test-app-config.mjs';
import './generate.mjs';

const selection = process.argv[2] ?? 'all';
const selected = applications.filter(
  (app) =>
    selection === 'all' || selection === app.id || (selection === 'remotes' && app.id !== 'shell'),
);
if (!selected.length)
  throw new Error('Use dev, dev:shell, dev:remotes, dev:discovery or dev:geology.');

async function assertPortAvailable(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', () =>
      reject(
        new Error(`Port ${port} is in use. Stop the existing test server before starting another.`),
      ),
    );
    probe.listen(port, () => probe.close(resolve));
  });
}
await Promise.all(selected.map((app) => assertPortAvailable(app.port)));

const running = [];
const starts = [];
let shutdown;
async function finish() {
  await Promise.allSettled(starts);
  const results = await Promise.allSettled(running.map(({ server }) => server.close()));
  for (const result of results) if (result.status === 'rejected') console.error(result.reason);
}
function stop() {
  shutdown ??= finish();
  return shutdown;
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    stop().then(
      () => {
        process.exitCode = 0;
      },
      (cause) => {
        console.error(cause);
        process.exitCode = 1;
      },
    );
  });

try {
  starts.push(
    ...selected.map(async (app) => {
      const rsbuild = await createRsbuild({
        cwd: join(workspace, 'fixtures', app.directory),
        rsbuildConfig: configuration(app),
      });
      const server = await rsbuild.startDevServer();
      running.push({ server });
      console.log(
        `${app.id.padEnd(10)} http://localhost:${app.port}/${app.id === 'shell' ? '' : 'mf-manifest.json'}`,
      );
    }),
  );
  await Promise.all(starts);
  if (!shutdown)
    console.log(
      '\nTest environment started. Open http://localhost:4100. Ctrl+C stops all selected servers.',
    );
} catch (cause) {
  console.error(cause);
  await stop();
  process.exitCode = 1;
}
