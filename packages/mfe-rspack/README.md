# React build integration

The current integration supplies the in-repository test Apps with native TanStack file routes,
React Compiler, scoped CSS, and Module Federation transport. Container configuration, capability
extraction, scaffolding, and publication remain later implementation work.

```js
import { mfePlugin } from '@company/mfe-rspack';

export default {
  context: import.meta.dirname,
  entry: {},
  plugins: [mfePlugin({ name: 'discovery' })],
};
```

Export `app` from `src/mfe.ts`. Use ordinary Rspack options for output, development servers,
source maps, and assets. The plugin adds the supported source/CSS rules; do not also install an
overlapping Babel, SWC, or CSS rule. The shell uses `reactBuild({ root })` for the same source
pipeline and `sharedDependencies()` for the verified singleton set.

The compiler processes App source, the React adapter, and the installed Tecton source artifact
before SWC erases TSX. Other framework packages receive only the TypeScript transform. React,
JSX runtimes, compiler runtime, Router, Query, the adapter hooks, and design-system provider
contexts share exact versions. Rspack source maps retain source locations through both transforms.

React Compiler 1.0.0 uses Babel 7.29.7. A real remote build showed that Babel 8.0.5 skips components
with default destructured props because of its changed assignment AST; the regression test
requires successful compilation of that ordinary author pattern. Compiler skip diagnostics
include their source location.

The shell owns Tecton's global stylesheet. A remote's utilities input references those tokens
without emitting them, then scans the installed artifact:

```css
@reference '@tecton/react/globals.css';
@import 'tailwindcss/utilities.css' layer(utilities);
@source './';
@source '../../../node_modules/@tecton/react/src';
```

The final PostCSS pass wraps utilities and local rules in a native scope with a nested-mount
boundary. Keyframes and Tailwind's registered custom properties receive per-App names;
shell-owned design tokens keep their original names. Global selectors, font faces, unresolved
imports, and unsupported global at-rules fail the build with their source location. Full overlay
and browser-matrix acceptance belongs to the CSS integration gate.

The test environment uses an explicit remote rebuild/reload fallback. React Fast Refresh is
not installed or claimed by this package.
