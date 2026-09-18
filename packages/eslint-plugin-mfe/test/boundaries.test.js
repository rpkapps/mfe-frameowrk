import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkBoundaries, dependencyViolation } from '../../../scripts/check-boundaries.mjs';

const temporaryDirectories = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(files) {
  const root = await mkdtemp(path.join(process.cwd(), '.boundary-test-'));
  temporaryDirectories.push(root);
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
}

describe('runtime import DAG', () => {
  it('accepts neutral imports and adapter-to-host edges', () => {
    expect(dependencyViolation('@company/mfe-core', 'zod')).toBeUndefined();
    expect(dependencyViolation('@company/mfe-host', '@company/mfe-core')).toBeUndefined();
    expect(dependencyViolation('@company/mfe-react', '@company/mfe-host')).toBeUndefined();
    expect(dependencyViolation('@company/mfe-legacy-angular', 'single-spa')).toBeUndefined();
  });

  it.each([
    ['@company/mfe-core', 'react'],
    ['@company/mfe-host', 'react-dom/client'],
    ['@company/mfe-core', '@tanstack/history'],
    ['@company/mfe-host', '@tanstack/react-router'],
    ['@company/mfe-host', '@module-federation/enhanced/runtime'],
    ['@company/mfe-react', '@company/mfe-rsbuild'],
    ['@company/mfe-core', '@company/mfe-host'],
    ['@company/mfe-react', '@company/mfe-legacy-angular'],
    ['@company/mfe-react', 'single-spa'],
    ['@company/mfe-react', '@opentelemetry/api'],
    ['@company/mfe-host', '@grafana/faro-web-sdk'],
    ['@company/mfe-react', 'zustand/vanilla'],
    ['@company/mfe-react', '@company/eslint-plugin-mfe'],
  ])('rejects %s importing %s', (owner, target) => {
    expect(dependencyViolation(owner, target)).toEqual(expect.any(String));
  });

  it('checks type imports, re-exports, dynamic imports, and manifest dependencies', async () => {
    const root = await fixture({
      'packages/core/package.json': JSON.stringify({
        name: '@company/mfe-core',
        dependencies: { react: '19.2.0' },
      }),
      'packages/core/src/index.ts': [
        'import type { ReactNode } from "react";',
        'export { createRouter } from "@tanstack/react-router";',
        'const load = () => import("@module-federation/enhanced/runtime");',
        'type Span = import("@opentelemetry/api").Span;',
      ].join('\n'),
    });
    const failures = await checkBoundaries(root);
    expect(failures).toHaveLength(5);
    expect(failures.some((failure) => failure.includes('src/index.ts:4'))).toBe(true);
  });

  it('rejects cross-package relative imports and unexported subpaths', async () => {
    const root = await fixture({
      'packages/core/package.json': JSON.stringify({
        name: '@company/mfe-core',
        exports: { '.': './src/index.ts' },
      }),
      'packages/core/src/index.ts': 'export const version = 1;',
      'packages/host/package.json': JSON.stringify({ name: '@company/mfe-host' }),
      'packages/host/src/index.ts':
        'import "../../core/src/index.ts"; import "@company/mfe-core/src/index.ts";',
    });
    expect(await checkBoundaries(root)).toHaveLength(2);
  });

  it('allows an exported subpath and ignores generated third-party output', async () => {
    const root = await fixture({
      'packages/core/package.json': JSON.stringify({
        name: '@company/mfe-core',
        exports: { '.': './src/index.ts', './errors': './src/errors.ts' },
      }),
      'packages/host/package.json': JSON.stringify({ name: '@company/mfe-host' }),
      'packages/host/src/index.ts': 'import "@company/mfe-core/errors";',
      'packages/host/dist/vendor.js': 'import "react";',
    });
    expect(await checkBoundaries(root)).toEqual([]);
  });
});
