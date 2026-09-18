# Gate 1 feasibility evidence

The bounded Rsbuild proof passes for a production Discovery remote. The test creates a temporary output directory and exercises the real `mfePlugin` configuration, so it checks emitted artifacts rather than only plugin options:

```sh
pnpm exec vitest run packages/mfe-rsbuild/src/gate-one-build-proof.test.mjs
```

Observed environment: Node `v24.19.0`, pnpm `11.19.0`. The run passed one test in 10.18s (13s wall time); Rsbuild reported a 6.56s production build. The proof checks exact singleton/strict-version sharing for React, JSX runtimes, `react/compiler-runtime`, `react-dom/client`, the shell-state context, and the scoped `@tecton/react/` package. It then checks that emitted JavaScript contains the compiler runtime, source maps retain local route/component, `@company/mfe-react`, and installed Tecton source locations, and that lazy route sources are present. The emitted packaged CSS contains a native `@scope` boundary for `discovery`, namespaced Tailwind registrations, and no remaining imports.

The packaged Tecton artifact also passes its immutable source, generated CSS, and declaration check:

```sh
node scripts/prepare-tecton.mjs --check
# Tecton 424889e4 verified: 172 upstream files; CSS and 167 declarations checked.
```

This check took 8s in the same environment. Tecton is consumed from the local package artifact: its runtime TSX is compiled by the shared Babel/Rspack pipeline, while its checked declarations provide the uncompiled consumer surface. The remote utilities stylesheet references the shell-owned globals and the build scopes the resulting remote CSS.

Route source edits use the existing rebuild and reload event path. The development configuration has HMR disabled; a remote edit therefore uses the explicit remote rebuild/reload fallback and a route edit is a full reload fallback. No Fast Refresh timing is claimed.

Browser evidence is limited to the Chromium CI project in the existing Playwright configuration. The Gate 1 result makes no Firefox, WebKit, or multi-engine claim, and no local Chromium installation or retry was used for this evidence.
