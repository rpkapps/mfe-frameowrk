# MFE framework

Implementation checkpoint for the supplied MFE framework specification. **Gate 0 is blocked; this is not a usable framework release.** No later implementation gate has started.

The checkpoint contains neutral App/lifecycle/error contracts, retry and resource disposal, a side-effect-free React App definition, shared lint tooling, the generated-route type fixture, and executable router feasibility tests. All packages are private while the contract is unresolved.

## Verify

Use Node **24.19.0** and pnpm **12.4.2** (pinned in the repository):

```sh
corepack pnpm@12.4.2 install --frozen-lockfile
corepack pnpm@12.4.2 run check
corepack pnpm@12.4.2 run gate:0
```

`check` verifies implemented behavior, formatting, lint, types, package boundaries, and dependency-script controls. `gate:0` separately asserts the original specification requirements and currently fails. Passing characterization tests does not mean the framework is conformant. CI runs both commands and remains blocked on the gate.

Generation runs automatically before typechecking. `pnpm run generate` is the recovery command. The introductory App has its own TypeScript program and native `Register` augmentation; `routeTree.gen.ts` is generated and ignored.

## Decisions required

1. The specified native `createRouter` factory creates browser history and patches global History before the adapter can replace it. The proposed bootstrap revision forwards a framework-owned history to native `createRouter`.
2. `router.update({ context })` leaves active native context consumers unchanged. The tested native invalidation path refreshes context but also reruns a default-stale loader. The proposed revision uses the already-specified selective shell-state hooks for reactive UI, retaining native context for route callbacks and session invalidation.
3. Gate 1 needs the actual shell source/integration location and its startup, session, and registry-enrollment instructions. These are absent from the empty destination repository. Test fixtures cannot establish authenticated-shell integration.

The original public factory contract is retained pending these decisions. No global patch, router-internal mutation, or hidden contract substitution has been added to production framework code.

Read [the feasibility evidence](docs/gate-zero-feasibility.md), [progress](docs/progress.md), [contributing guidance](docs/contributing.md), and [dependency-script policy](docs/dependency-build-policy.md). The complete supplied specification remains the source of requirements; this checkpoint does not waive its later gates.
