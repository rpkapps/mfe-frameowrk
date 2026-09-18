# Gate 1 feasibility evidence

The bounded Rsbuild proof passes for a production Discovery remote. The test creates a temporary output directory and exercises the real `mfePlugin` configuration, so it checks emitted artifacts rather than only plugin options:

```sh
pnpm exec vitest run packages/mfe-rsbuild/src/gate-one-build-proof.test.mjs
```

Observed environment: Node `v24.19.0`, pnpm `11.19.0`. The run passed one test in 10.18s (13s wall time); Rsbuild reported a 6.56s production build. The proof checks the sharing configuration and strict-version declarations for React, JSX runtimes, `react/compiler-runtime`, `react-dom/client`, the shell-state context, and the scoped `@tecton/react/` package. These declarations and configuration do not by themselves prove runtime singleton identity; that remains an emitted and browser-consumer concern. It then checks that emitted JavaScript contains the compiler runtime, source maps retain local route/component, `@company/mfe-react`, and installed Tecton source locations, and that lazy route sources are present. Lazy source presence is not proof of lazy execution. The emitted packaged CSS contains a native `@scope` boundary for `discovery`, namespaced Tailwind registrations, and no remaining imports.

The packaged Tecton artifact also passes its immutable source, generated CSS, and declaration check:

```sh
node scripts/prepare-tecton.mjs --check
# Tecton 424889e4 verified: 172 upstream files; CSS and 167 declarations checked.
```

This check took 8s in the same environment. Tecton is consumed from the local package artifact: its runtime TSX is compiled by the shared Babel/Rspack pipeline, while its checked declarations provide the uncompiled consumer surface. The new compiled consumer and explicit `use no memo` consumer fixture exercise actual consumer behavior in the existing tests; the fixture is evidence only after the corresponding CI run, not a declaration-level claim. The remote utilities stylesheet references the shell-owned globals and the build scopes the resulting remote CSS.

Route source edits use the existing rebuild and reload event path. The development configuration has HMR disabled; a remote edit therefore uses the explicit remote rebuild/reload fallback and a route edit is a full reload fallback. No Fast Refresh timing is claimed.

### Initial browser feature/coverage matrix (§9.2)

| Engine          | Recorded evidence                                           | Status                                                     |
| --------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Chromium/Chrome | Existing Playwright Chromium CI project and CI browser runs | Recorded; version/usage report remains a release-gate task |
| Firefox         | No run recorded                                             | Untested; no claim made                                    |
| WebKit          | No run recorded                                             | Untested; no claim made                                    |

The current Gate 1 record requires the Chromium evidence above. Firefox and WebKit are recorded as untested and are not treated as mandatory here unless a later §9.2 target matrix requires them. No local Chromium installation or retry was used for this evidence.
