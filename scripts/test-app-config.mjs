import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { HtmlRspackPlugin } from '@rspack/core';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import { mfePlugin, reactBuild, sharedDependencies } from '@company/mfe-rspack';

export const workspace = fileURLToPath(new URL('../', import.meta.url));
export const applications = [
  { id: 'discovery', directory: 'discovery-app', port: 4101 },
  { id: 'geology', directory: 'geology-app', port: 4102 },
  { id: 'shell', directory: 'test-shell', port: 4100 },
];

export function configuration(app, mode = 'development') {
  const root = join(workspace, 'fixtures', app.directory);
  const shell = app.id === 'shell';
  return {
    name: app.id,
    mode,
    context: root,
    target: 'web',
    entry: shell ? './src/main.ts' : {},
    devtool: 'source-map',
    output: {
      path: join(root, 'dist'),
      publicPath: `http://localhost:${app.port}/`,
      uniqueName: `test_${app.id}`,
      filename: '[name].js',
      chunkFilename: '[name].[contenthash:8].js',
      clean: true,
    },
    resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs'] },
    module: { rules: shell ? reactBuild({ root }) : [] },
    optimization: { minimize: mode === 'production' },
    plugins: shell
      ? [
          new ModuleFederationPlugin({
            name: 'test_shell',
            shared: sharedDependencies(),
            dts: false,
          }),
          new HtmlRspackPlugin({
            title: 'Tecton · MFE test shell',
            templateContent:
              '<!doctype html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tecton · MFE test shell</title></head><body><div id="root"></div></body></html>',
          }),
        ]
      : [mfePlugin({ name: app.id, root })],
    stats: 'errors-warnings',
  };
}
