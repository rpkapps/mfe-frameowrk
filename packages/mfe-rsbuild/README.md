# Rsbuild integration

`@company/mfe-rsbuild` supplies the in-repository test Apps with native TanStack file
routes, React Compiler, scoped CSS, and private Module Federation 2 transport. Container
configuration, capability extraction, scaffolding, and publication remain later work.

The package targets Rsbuild **2.2.8**, with `@rsbuild/plugin-babel` and
`@rsbuild/plugin-react` **2.1.0** and `@module-federation/rsbuild-plugin` **2.9.0**.
Rsbuild uses the pinned Rspack **2.2.6** engine underneath. These versions are one
coordinated build surface; this package does not introduce a second bundler.

Both factories return native Rsbuild plugin collections for direct composition in `plugins`. An App uses native Rsbuild configuration and the public `mfePlugin`; pass `root` explicitly when the `createRsbuild` working directory differs from the App directory. If omitted, either factory resolves `root` from `process.cwd()`:

```js
import { defineConfig } from '@rsbuild/core';
import { mfePlugin } from '@company/mfe-rsbuild';

export default defineConfig({
  root: import.meta.dirname,
  source: { entry: {} },
  plugins: [mfePlugin({ name: 'discovery', root: import.meta.dirname })],
});
```

Export `app` from `src/mfe.ts`. Ordinary Rsbuild options remain available for output,
development servers, source maps, and assets. The plugin adds the supported source, route,
and MF2 integration; do not install overlapping Babel, SWC, or CSS rules. A shell composes
`sharedReactPlugin({ root })` with its own ordinary Rsbuild plugins for the shared React and
CSS pipeline. Both plugin factories accept the optional `root` setting described above. MF2 manifests, sharing, registration, and transport helpers
remain private implementation details.

The compiler processes App source, the React adapter, and the installed Tecton source
artifact before SWC erases TSX. Other framework packages receive only the TypeScript
transform. React, JSX runtimes, compiler runtime, Router, Query, adapter hooks, and
design-system provider contexts share exact versions. Rsbuild source maps retain source
locations through both transforms.

React Compiler 1.0.0 uses Babel 7.29.7. A real remote build showed that Babel 8.0.5 skips
components with default destructured props because of its changed assignment AST; the
regression test requires successful compilation of that ordinary author pattern. Compiler
skip diagnostics include their source location.

The shell owns Tecton's global stylesheet. A remote's utilities input references those
tokens without emitting them, then scans the installed artifact:

```css
@reference '@tecton/react/globals.css';
@import 'tailwindcss/utilities.css' layer(utilities);
@source './';
@source '../../../node_modules/@tecton/react/src';
```

The final PostCSS pass wraps utilities and local rules in a native scope with a nested-mount
boundary. Keyframes and Tailwind's registered custom properties receive per-App names;
shell-owned design tokens keep their original names. Global selectors, font faces, unresolved
imports, and unsupported global at-rules fail the build with their source location. Full
overlay and browser-matrix acceptance belongs to the CSS integration gate.

The test environment uses an explicit remote rebuild/reload fallback. React Fast Refresh is
not installed or claimed by this package.
