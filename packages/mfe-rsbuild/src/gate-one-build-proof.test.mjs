import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRsbuild } from '@rsbuild/core';
import { expect, it } from 'vitest';
import { configuration } from '../../../scripts/test-app-config.mjs';
import { sharedDependencies } from './shared-dependencies.mjs';

const workspace = path.resolve(import.meta.dirname, '../../..');
const app = { id: 'discovery', directory: 'discovery-app', port: 4101 };

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(file)));
    else files.push(file);
  }
  return files;
}

it('builds a bounded remote with compiled and explicitly excluded adapter consumers', async () => {
  const shared = sharedDependencies();
  for (const name of [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react/compiler-runtime',
    'react-dom/client',
    '@company/mfe-react/internal/shell-state-context',
    '@tecton/react/',
  ]) {
    expect(shared[name], name).toMatchObject({ singleton: true, strictVersion: true });
  }

  const output = await mkdtemp(path.join(os.tmpdir(), 'mfe-gate-one-'));
  try {
    const root = path.join(workspace, 'fixtures', app.directory);
    // Keep names and compiler output readable so this assertion checks emitted
    // behavior for each fixture consumer, rather than only compiler config.
    const config = configuration(app, 'development');
    config.output = { ...config.output, minify: false };
    config.output = { ...config.output, distPath: { root: output } };
    const rsbuild = await createRsbuild({ cwd: root, rsbuildConfig: config });
    await rsbuild.build();

    const files = await filesUnder(output);
    const js = files.filter((file) => file.endsWith('.js'));
    const maps = files.filter((file) => file.endsWith('.js.map'));
    const css = files.filter((file) => file.endsWith('.css'));
    expect(files.some((file) => file.endsWith('remoteEntry.js'))).toBe(true);
    expect(files.some((file) => file.endsWith('remoteEntry.js.map'))).toBe(true);
    const jsText = await Promise.all(js.map((file) => readFile(file, 'utf8'))).then((texts) =>
      texts.join('\n'),
    );
    expect(jsText).toMatch(/react\/compiler-runtime/);
    const discoveryChunk = await Promise.all(
      js.filter((file) => file.includes('src_components_discovery-screen')).map((file) => readFile(file, 'utf8')),
    ).then((texts) => texts.join('\n'));
    expect(discoveryChunk).toContain('function CompiledAdapterConsumer');
    expect(discoveryChunk).toContain('function UncompiledAdapterConsumer');
    const compiled = discoveryChunk.slice(
      discoveryChunk.indexOf('function CompiledAdapterConsumer'),
      discoveryChunk.indexOf('function UncompiledAdapterConsumer'),
    );
    const excludedStart = discoveryChunk.indexOf('function UncompiledAdapterConsumer');
    const excluded = discoveryChunk.slice(
      excludedStart,
      discoveryChunk.indexOf('function DisciplineIcon', excludedStart),
    );
    // The compiler emits slot caching for the eligible consumer and leaves the
    // `use no memo` consumer as ordinary hook calls.
    expect(compiled).toMatch(/const \$ = \[\];|const \$ =/);
    expect(compiled).toMatch(/if \(\$\[/);
    expect(excluded).toMatch(/useTheme\)\(\)/);
    expect(excluded).not.toMatch(/if \(\$\[/);

    const mapSources = (
      await Promise.all(
        maps.map(async (file) => {
          try {
            return JSON.parse(await readFile(file, 'utf8')).sources ?? [];
          } catch {
            return [];
          }
        }),
      )
    ).flat();
    expect(
      mapSources.some((source) => source.includes('src/components/discovery-screen.tsx')),
    ).toBe(true);
    expect(mapSources.some((source) => source.includes('mfe-react/src'))).toBe(true);
    expect(mapSources.some((source) => source.includes('@tecton/react/src'))).toBe(true);
    expect(mapSources.some((source) => source.includes('src/routes/index.tsx'))).toBe(true);
    expect(mapSources.some((source) => source.includes('src/routes/framing.tsx'))).toBe(true);

    const cssText = await Promise.all(css.map((file) => readFile(file, 'utf8'))).then((texts) =>
      texts.join('\n'),
    );
    expect(cssText).toMatch(
      /@scope\s*\(\s*\[data-mfe-scope\s*=\s*["']?discovery["']?\s*\]\s*\)\s*to\s*\(\s*\[data-mfe-scope\]/,
    );
    expect(cssText).toMatch(/\[data-mfe-scope\s*=\s*["']?discovery/);
    expect(cssText).not.toMatch(/@import\s/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}, 30_000);
