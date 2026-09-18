import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { pluginBabel } from '@rsbuild/plugin-babel';
import { pluginReact } from '@rsbuild/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/rspack';
import tailwind from '@tailwindcss/postcss';
import { scopedCss, assertScope } from './scoped-css.mjs';
import { sharedDependencies } from './shared-dependencies.mjs';

export { sharedDependencies };

const require = createRequire(import.meta.url);
const compilerPlugin = require.resolve('babel-plugin-react-compiler');
const packageRoot = fileURLToPath(new URL('../../mfe-react/src/', import.meta.url));
function sourceIncludes(root) {
  return [
    path.resolve(root, 'src'),
    packageRoot,
    /[\\/](?:@tecton[\\/]react|tecton-react)[\\/]src[\\/]/,
  ];
}
function compilerLogger(filename, event) {
  if (!['CompileError', 'CompileSkip', 'PipelineError'].includes(event.kind)) return;
  const reason = event.reason ?? event.detail?.reason ?? event.data ?? event.kind;
  console.warn(
    `[React Compiler] ${filename ?? 'unknown source'}:${event.fnLoc?.start.line ?? 1}: ${reason}`,
  );
}

/** Shared React pipeline for shells and remotes. Babel runs before Rsbuild's SWC pass. */
export function sharedReactPlugin({ root, scope } = {}) {
  const directory = path.resolve(root ?? process.cwd());
  const babel = pluginBabel({
    include: sourceIncludes(directory),
    babelLoaderOptions: (options) => {
      options.babelrc = false;
      options.configFile = false;
      options.sourceMaps = true;
      options.cacheDirectory = path.resolve(directory ?? process.cwd(), '.mfe/babel');
      options.parserOpts = { ...(options.parserOpts ?? {}), plugins: ['typescript', 'jsx'] };
      options.plugins = [
        [compilerPlugin, { target: '19', logger: { logEvent: compilerLogger } }],
        ...(options.plugins ?? []),
      ];
      return options;
    },
  });
  const localPlugin = {
    name: 'mfe-react',
    setup(api) {
      const resolvedRoot = directory;
      api.modifyEnvironmentConfig((config) => {
        config.dev ??= {};
        config.dev.hmr = false;
      });
      api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) =>
        mergeRsbuildConfig(config, {
          output: { sourceMap: { js: 'source-map' } },
          tools: {
            postcss: (options, { addPlugins }) => {
              addPlugins(
                [
                  tailwind({ base: resolvedRoot, optimize: false }),
                  ...(scope ? [scopedCss(scope)] : []),
                ],
                { order: 'post' },
              );
            },
          },
        }),
      );
      if (scope)
        api.modifyRspackConfig((config) => {
          config.plugins ??= [];
          config.plugins.push(
            tanstackRouter({
              target: 'react',
              routesDirectory: path.join(resolvedRoot, 'src/routes'),
              generatedRouteTree: path.join(resolvedRoot, 'src/routeTree.gen.ts'),
              autoCodeSplitting: true,
            }),
          );
        });
    },
  };
  return [localPlugin, pluginReact({ fastRefresh: false }), babel];
}

/** Native Rsbuild MF2 integration for an App remote. */
export function mfePlugin({ name, root: directory } = {}) {
  const root = path.resolve(directory ?? process.cwd());
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const scope = name ?? manifest.name?.split('/').at(-1);
  assertScope(scope);
  const definition = path.join(root, 'src/mfe.ts');
  if (!fs.existsSync(definition))
    throw new Error(`MFE ${scope}: create src/mfe.ts and export the App definition as app.`);
  return [
    ...sharedReactPlugin({ root, scope }),
    pluginModuleFederation({
      name: scope.replaceAll('-', '_'),
      filename: 'remoteEntry.js',
      exposes: { './app': definition },
      shared: sharedDependencies(),
      manifest: true,
      dts: false,
    }),
  ];
}
