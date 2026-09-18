import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const runtimePackages = new Set([
  '@company/mfe-core',
  '@company/mfe-host',
  '@company/mfe-react',
  '@company/mfe-legacy-angular',
]);
const runtimeEdges = {
  '@company/mfe-core': [],
  '@company/mfe-host': ['@company/mfe-core'],
  '@company/mfe-react': ['@company/mfe-core', '@company/mfe-host'],
  '@company/mfe-legacy-angular': ['@company/mfe-core', '@company/mfe-host'],
};
const statePackages = new Set([
  'zustand',
  'redux',
  '@reduxjs/toolkit',
  'react-redux',
  'mobx',
  'mobx-react',
  'mobx-react-lite',
  'jotai',
  '@tanstack/store',
  '@tanstack/react-store',
]);
const ignoredDirectories = new Set([
  'node_modules',
  '.git',
  '.mfe',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
]);

function packageName(specifier) {
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
}

function vendorPackage(name) {
  return name.startsWith('@opentelemetry/') || name.startsWith('@grafana/faro-');
}

/** A shared rule for import declarations, type imports, and manifest dependencies. */
export function dependencyViolation(owner, specifier) {
  const target = packageName(specifier);
  if (runtimePackages.has(owner)) {
    if (statePackages.has(target))
      return 'Framework state must use purpose-specific TypeScript structures (§12.4).';
    if (vendorPackage(target))
      return 'Telemetry providers belong to the shell integration (§5.16).';
    if (target === '@company/eslint-plugin-mfe')
      return 'Development lint tooling must not enter runtime packages (§12.2).';
    if (
      target.startsWith('@company/mfe-') &&
      target !== owner &&
      !runtimeEdges[owner].includes(target)
    ) {
      return `${owner} cannot depend on ${target}; follow the runtime import DAG (§12.2).`;
    }
    if (target.startsWith('single-spa') && owner !== '@company/mfe-legacy-angular') {
      return 'Only the legacy adapter may import the single-spa contract (§12.2).';
    }
  }
  if (owner === '@company/mfe-core' || owner === '@company/mfe-host') {
    if (
      [
        'react',
        'react-dom',
        '@tanstack/react-router',
        '@tanstack/router-core',
        '@tanstack/history',
      ].includes(target) ||
      target.startsWith('@module-federation/') ||
      target.startsWith('@angular/') ||
      target.startsWith('single-spa')
    ) {
      return 'The neutral core and host cannot import UI, router, federation, or legacy dependencies (§12).';
    }
  }
  return undefined;
}

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name))
        result.push(...(await filesUnder(path.join(directory, entry.name))));
    } else if (entry.isFile()) {
      result.push(path.join(directory, entry.name));
    }
  }
  return result;
}

function importsIn(file, source) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  function collect(node) {
    let literal;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      literal = node.moduleSpecifier;
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      literal = node.argument.literal;
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      literal = node.moduleReference.expression;
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      literal = node.arguments[0];
    }
    if (literal && ts.isStringLiteralLike(literal)) {
      imports.push({
        specifier: literal.text,
        line: tree.getLineAndCharacterOfPosition(literal.getStart()).line + 1,
      });
    }
    ts.forEachChild(node, collect);
  }
  collect(tree);
  return imports;
}

/** Read-only check: resolve file ownership before checking every static import. */
export async function checkBoundaries(root) {
  const files = await filesUnder(root);
  const packages = [];
  for (const file of files.filter((candidate) => path.basename(candidate) === 'package.json')) {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    if (typeof manifest.name === 'string')
      packages.push({ name: manifest.name, directory: path.dirname(file), manifest, file });
  }
  packages.sort((a, b) => b.directory.length - a.directory.length);
  function ownerOf(file) {
    return packages.find(
      (entry) => file === entry.directory || file.startsWith(`${entry.directory}${path.sep}`),
    );
  }
  const failures = [];
  function fail(file, line, message) {
    failures.push(`${path.relative(root, file)}:${line}: ${message}`);
  }
  for (const owner of packages) {
    for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const dependency of Object.keys(owner.manifest[section] ?? {})) {
        const violation = dependencyViolation(owner.name, dependency);
        if (violation) fail(owner.file, 1, `${dependency}: ${violation}`);
      }
    }
  }
  for (const file of files.filter((candidate) => /\.[cm]?[jt]sx?$/.test(candidate))) {
    const owner = ownerOf(file);
    if (!owner) continue;
    for (const { specifier, line } of importsIn(file, await readFile(file, 'utf8'))) {
      if (specifier.startsWith('.')) {
        const target = ownerOf(path.resolve(path.dirname(file), specifier));
        if (
          target &&
          target.name !== owner.name &&
          (runtimePackages.has(owner.name) || runtimePackages.has(target.name))
        ) {
          fail(
            file,
            line,
            `${specifier}: Import ${target.name} through its public package export, not a cross-package relative path.`,
          );
        }
        continue;
      }
      const violation = dependencyViolation(owner.name, specifier);
      if (violation) fail(file, line, `${specifier}: ${violation}`);
      const targetName = packageName(specifier);
      const target = packages.find((entry) => entry.name === targetName);
      if (target && target.name !== owner.name && specifier !== targetName) {
        const exportName = `.${specifier.slice(targetName.length)}`;
        if (!Object.hasOwn(target.manifest.exports ?? {}, exportName)) {
          fail(file, line, `${specifier}: Import only the package's declared public exports.`);
        }
      }
      if (
        owner.name === '@company/fixture-test-shell' &&
        (specifier.includes('/internal') ||
          targetName.startsWith('@module-federation/') ||
          targetName.startsWith('@tanstack/'))
      ) {
        fail(
          file,
          line,
          `${specifier}: The test shell must use public host, adapter, and transport APIs.`,
        );
      }
      if (
        owner.name !== '@company/fixture-test-shell' &&
        /^(fixtures|examples)\//.test(path.relative(root, file).split(path.sep).join('/'))
      ) {
        if (
          ['@company/mfe-core', '@company/mfe-host', '@company/mfe-legacy-angular'].includes(
            targetName,
          )
        ) {
          fail(
            file,
            line,
            `${specifier}: Author fixtures use @company/mfe-react and @company/mfe-rsbuild public exports.`,
          );
        }
        if (vendorPackage(targetName))
          fail(file, line, `${specifier}: Author telemetry uses framework-owned exports.`);
      }
    }
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const failures = await checkBoundaries(root);
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Package boundaries passed.');
  }
}
