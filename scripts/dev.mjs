import { createServer } from 'node:net';
import { rspack } from '@rspack/core';
import { RspackDevServer } from '@rspack/dev-server';
import { applications, configuration } from './test-app-config.mjs';
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
let starts = [];
let shutdown;
function stop() {
  shutdown ??= finish();
  return shutdown;
}
async function finish() {
  await Promise.allSettled(starts);
  const results = await Promise.allSettled(
    running.map(async ({ server, compiler, clients }) => {
      for (const client of clients) client.end();
      try {
        await server.stop();
      } finally {
        await new Promise((resolve, reject) =>
          compiler.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }),
  );
  for (const result of results) if (result.status === 'rejected') console.error(result.reason);
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
  starts = selected.map(async (app) => {
    const compiler = rspack(configuration(app));
    const clients = new Set();
    let hash;
    compiler.hooks.done.tap('TestShellReload', (stats) => {
      if (stats.hasErrors()) return;
      hash = stats.hash;
      for (const client of clients) client.write(`data: ${hash}\n\n`);
    });
    const server = new RspackDevServer(
      {
        host: 'localhost',
        port: app.port,
        setupExitSignals: false,
        hot: false,
        liveReload: app.id === 'shell',
        client: app.id === 'shell' ? { overlay: true } : false,
        headers: { 'Access-Control-Allow-Origin': 'http://localhost:4100' },
        historyApiFallback: app.id === 'shell',
        static: false,
        setupMiddlewares(middlewares) {
          const headers = middlewares.findIndex((middleware) => middleware.name === 'set-headers');
          middlewares.splice(headers + 1, 0, {
            name: 'remote-rebuild-events',
            path: '/__mfe_events',
            middleware: (request, response) => {
              response.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': 'http://localhost:4100',
                Connection: 'keep-alive',
              });
              if (hash) response.write(`data: ${hash}\n\n`);
              clients.add(response);
              request.on('close', () => clients.delete(response));
            },
          });
          return middlewares;
        },
      },
      compiler,
    );
    running.push({ server, compiler, clients });
    await server.start();
    console.log(
      `${app.id.padEnd(10)} http://localhost:${app.port}/${app.id === 'shell' ? '' : 'mf-manifest.json'}`,
    );
  });
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
