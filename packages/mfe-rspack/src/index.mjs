import fs from 'node:fs';
import path from 'node:path';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import { tanstackRouter } from '@tanstack/router-plugin/rspack';
import { reactBuild } from './react-build.mjs';
import { assertScope } from './scoped-css.mjs';
import { sharedDependencies } from './shared-dependencies.mjs';

export { reactBuild, sharedDependencies };

/** Gate 1 App build: native file routes, compiler, scoped CSS, and MF2 transport. */
export function mfePlugin({ name, root: directory } = {}) {
  return {
    name: 'MfePlugin',
    apply(compiler) {
      const root = path.resolve(directory ?? compiler.context);
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const scope = name ?? manifest.name?.split('/').at(-1);
      assertScope(scope);
      const definition = path.join(root, 'src/mfe.ts');
      if (!fs.existsSync(definition)) {
        throw new Error(`MFE ${scope}: create src/mfe.ts and export the App definition as app.`);
      }
      compiler.options.module.rules.push(...reactBuild({ root, scope }));
      tanstackRouter({
        target: 'react',
        routesDirectory: path.join(root, 'src/routes'),
        generatedRouteTree: path.join(root, 'src/routeTree.gen.ts'),
        autoCodeSplitting: true,
      }).apply(compiler);
      new ModuleFederationPlugin({
        name: scope.replaceAll('-', '_'),
        filename: 'remoteEntry.js',
        exposes: { './app': definition },
        shared: sharedDependencies(),
        manifest: true,
        dts: false,
      }).apply(compiler);
    },
  };
}
