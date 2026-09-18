# Dependency build policy

The workspace uses the latest stable pnpm and pins Node 24.19.0. CI installs
pnpm's `latest` release; no pnpm version is pinned in the repository. Dependency installation uses
`strictDepBuilds: true`, `dangerouslyAllowAllBuilds: false`, and an initially empty
`allowBuilds` map. CI uses `pnpm install --frozen-lockfile` and never approves
dependencies automatically.

The exact `prettier@3.9.8` release-age exception was reviewed at kickoff. That
package declares no preinstall, install, or postinstall scripts. This narrowly
scoped age exception does not authorize dependency scripts; `allowBuilds` remains
empty. All runtime and tooling versions are locked.

Before approving a dependency, review its resolved artifact/version, lifecycle
script, and purpose. Commit the narrowly scoped decision with the dependency
change. Registry packages should use an exact-version matcher; tarball dependencies
need the full resolved artifact identity. Explicit `false` entries document
denials. Do not repair installation by bulk approval, wildcard approval, or
disabling either control. See [pnpm's build settings](https://pnpm.io/settings/build).

## Executable verification

With pnpm installed, run:

```sh
pnpm check:build-policy
```

When invoking a separately installed executable, supply its path:

```sh
PNPM_EXECUTABLE=/absolute/path/to/pnpm node scripts/check-build-policy.mjs
```

The script reuses the pnpm executable that launched it, or resolves `pnpm` from
`PATH` when run directly with Node. It verifies the installed version's behavior
without requiring a particular version. It packs three distinct local
dependencies at version 1.0.0, each containing the same reviewed postinstall
behavior: write a fixed marker inside its own package directory. Each consumer
uses a separate empty package store, a generated lockfile, offline installation,
and a frozen-lockfile install. No registry package or credential is needed.

| Decision                       | Required install result                                 | Required script result |
| ------------------------------ | ------------------------------------------------------- | ---------------------- |
| Unreviewed                     | Fails with `ERR_PNPM_IGNORED_BUILDS` naming the package | No marker              |
| Exact packed artifact approved | Succeeds                                                | Expected marker        |
| Exact packed artifact denied   | Succeeds                                                | No marker              |

The approved tarball matcher includes its complete `name@file:...-1.0.0.tgz`
identity, as required by pnpm for non-registry artifacts. This approval exists only
inside the isolated test consumer. It does not modify or broaden the workspace's
dependency approvals.

Temporary files live in a unique directory below `node_modules` and are removed on
completion, including failed assertions. Install-script policy checks verify these
fixtures only. They do not establish a clean-cache scaffold installation, package
distribution, or the safety of code explicitly executed by developers.

## Test-shell toolchain review

Rspack 2.2.6 and its exact same-version platform bindings have narrowly scoped release-age exceptions. Their registry artifacts declare no preinstall/install/postinstall hooks; native code is delivered as platform packages. This does not approve lifecycle scripts: `allowBuilds` remains empty. The frozen lockfile pins the Rspack, federation, compiler, Tailwind, browser-test, and Tecton dependency graph.

React Compiler 1.0.0 uses Babel 7.29.7: an actual default-destructured TSX component failed optimization with Babel 8.0.5 and passed with Babel 7.29.7. The regression is checked alongside CSS isolation tests. Tecton is a private local file artifact with immutable upstream checksums and no dependency install scripts; its tracked declarations are generated explicitly by the preparation script.
