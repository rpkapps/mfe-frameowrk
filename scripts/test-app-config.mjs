import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { mfePlugin, sharedDependencies, sharedReactPlugin } from '@company/mfe-rsbuild';

export const workspace = fileURLToPath(new URL('../', import.meta.url));
function remoteReloadPlugin() {
  const clients = new Set();
  let hash;
  return {
    name: 'test-remote-reload-events',
    setup(api) {
      api.onAfterDevCompile(({ stats }) => {
        if (stats.hasErrors()) return;
        hash = stats.hash;
        for (const client of clients) client.write(`data: ${hash}\n\n`);
      });
      api.modifyRsbuildConfig((config) => ({
        ...config,
        server: {
          ...config.server,
          setup({ server }) {
            server.middlewares.use('/__mfe_events', (request, response, next) => {
              if (request.method !== 'GET') return next();
              response.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': 'http://localhost:4100',
                Connection: 'keep-alive',
              });
              if (hash) response.write(`data: ${hash}\n\n`);
              clients.add(response);
              request.on('close', () => clients.delete(response));
            });
            return () => {
              for (const client of clients) client.end();
              clients.clear();
            };
          },
        },
      }));
      api.onCloseDevServer(() => {
        for (const client of clients) client.end();
        clients.clear();
      });
    },
  };
}

export const applications = [
  { id: 'discovery', directory: 'discovery-app', port: 4101 },
  { id: 'geology', directory: 'geology-app', port: 4102 },
  { id: 'shell', directory: 'test-shell', port: 4100 },
];

export function configuration(app, mode = 'development') {
  const root = join(workspace, 'fixtures', app.directory);
  const shell = app.id === 'shell';
  return {
    mode,
    source: { entry: shell ? { index: './src/main.ts' } : {} },
    output: {
      distPath: { root: join(root, 'dist') },
      assetPrefix: `http://localhost:${app.port}/`,
      cleanDistPath: true,
      sourceMap: { js: 'source-map' },
      minify: mode === 'production',
    },
    resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs'] },
    server: {
      port: app.port,
      host: 'localhost',
      cors: { origin: 'http://localhost:4100' },
      historyApiFallback: shell,
      strictPort: true,
    },
    dev: { hmr: false, liveReload: shell },
    html: shell ? { template: join(root, 'index.html') } : undefined,
    plugins: shell
      ? [
          sharedReactPlugin({ root }),
          pluginModuleFederation({
            name: 'test_shell',
            filename: 'remoteEntry.js',
            shared: sharedDependencies(),
            dts: false,
          }),
        ]
      : [mfePlugin({ name: app.id, root }), remoteReloadPlugin()],
  };
}
