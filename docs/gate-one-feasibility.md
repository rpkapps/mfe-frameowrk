# Gate 1 feasibility evidence

## Current bounded evidence — 2026-09-18

- The native Tecton `Dialog`, `Button`, and `PortalProvider` path replaces the
  custom blocker modal. The host regression verifies that native back restores
  the cursor before blocking and that the resolver proceeds once.
- The real MF2 Discovery proof mounts the generated route tree concurrently in
  distinct router/context/loader instances and keeps unsaved blockers
  mount-local. The Chromium proof verifies scoped Tecton Dialog Escape, focus,
  and disposal isolation.
- Compiled and explicit `use no memo` consumers respond to framework hook/theme
  updates. The artifact checks cover compiler output, source maps, and scope
  locations. Historical local check evidence at that checkpoint covers 208
  behavior tests and both Gate 0 tests.
- Portal forwarding is supplied upstream in
  [Tecton PR #24](https://github.com/rpkapps/tecton-ui-1/pull/24), covering
  internal forwarding for supported React Aria Components overlay wrappers;
  consumers use the Tecton API. The earlier durable head
  `8b1aa66c2a600b8c32ebef6d98bafb6121e940d7` is historical. The current
  framework canonical artifact is repinned to upstream head
  `576a766a4af5401c7f232a5f9f8460acf9e31ae6`; independent validation reports
  the upstream 312-test, 21-file suite and workspace typecheck passing. Its
  `generated:check` also passed in CI run
  [35385630925](https://github.com/rpkapps/tecton-ui-1/actions/runs/35385630925)
  (59 checks reported, 0 failures).
- Historical CI run [35380935168](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35380935168)
  at exact commit `adf97ab9412b50501e6cfc7781a7d6f6c30a036a` passes 208 behavior
  tests, both Gate 0 tests, all three production builds, and all 13 Chromium
  browser tests in 39s. The dual-mount scoped Tecton Dialog proof covers Escape,
  focus, and disposal. Firefox and WebKit remain untested.
- Historical CI run `35387540423` on reviewed head `4e2daa1` recorded 210 behavior tests,
  both Gate 0 tests, all three production builds, and 14 Chromium checks in
  34.4s. Its tracing fixture result is historical only after the approved
  tracing deferral; no current tracing pass is claimed.
- `node scripts/build-test-apps.mjs` exits 0 for all three production builds;
  emitted remote bundles contain no OTel or `StackContextManager` imports and
  preserve the native `await` needed by the historical fixture. This is not a
  current tracing acceptance claim; later tracing and telemetry integration are
  deferred.

## Gate 1 scope after tracing deferral

The reviewed-head audit supports the remaining Gate 1 criteria. The original tracing item 11 is
removed from the current exit requirement by the approved contract revision:

| Criteria | Evidence                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| 1–6      | CI build, MF2 loading, generated CSS, override, navigation, and browser boundary checks in run `35387540423`     |
| 7        | Author setup/editor types and local shell path documented; see the observed author-journey friction record below |
| 8        | Compiler and mixed consumer artifact checks in the same CI run                                                   |
| 9–10     | Native blocker and concurrent mount isolation Chromium checks in the same CI run                                 |
| 11       | Deferred; no current tracing implementation or acceptance result is claimed                                      |

The remaining Gate 1 evidence is retained. A later dedicated tracing gate must review and prove
the framework-owned contract before telemetry-provider integration; no deadline or new public API
is approved.

Observed author-journey friction (§17.3): a fresh checkout requires dependency installation
and generated route/declaration files before editor types are available. `pnpm dev` runs
generation before starting the shell and remotes. Remote route edits use the explicit full
reload fallback, preserving the URL and shell theme; this path makes no Fast Refresh claim.

The bounded Rsbuild proof passes for a production Discovery remote. The test creates a temporary output directory and exercises the real `mfePlugin` configuration, so it checks emitted artifacts rather than only plugin options:

```sh
pnpm exec vitest run packages/mfe-rsbuild/src/production-build.test.mjs
```

Observed environment: Node `v24.19.0`, pnpm `11.19.0`. The run passed one test in 10.18s (13s wall time); Rsbuild reported a 6.56s production build. The proof checks the sharing configuration and strict-version declarations for React, JSX runtimes, `react/compiler-runtime`, `react-dom/client`, the shell-state context, and the scoped `@tecton/react/` package. These declarations and configuration do not by themselves prove runtime singleton identity; that remains an emitted and browser-consumer concern. It then checks that emitted JavaScript contains the compiler runtime, source maps retain local route/component, `@company/mfe-react`, and installed Tecton source locations, and that lazy route sources are present. Lazy source presence is not proof of lazy execution. The emitted packaged CSS contains a native `@scope` boundary for `discovery`, namespaced Tailwind registrations, and no remaining imports.

The packaged Tecton artifact also passes its immutable source, generated CSS, and declaration check:

```sh
node scripts/prepare-tecton.mjs --check
# Historical Tecton 424889e4 artifact: 172 upstream files; CSS and 167 declarations checked.
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
