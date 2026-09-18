import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import mfe from '../src/index.js';

async function lint(preset, code, filePath = 'src/example.js') {
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: mfe.configs[preset] });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages;
}

describe('composable flat presets', () => {
  it('enforces global patch prevention in both presets', async () => {
    for (const preset of ['framework', 'author']) {
      const messages = await lint(preset, 'window.fetch = () => Promise.resolve(new Response());');
      expect(messages).toContainEqual(
        expect.objectContaining({ ruleId: 'mfe/no-global-patching', severity: 2 }),
      );
    }
  });

  it('starts definition stability as an author warning', async () => {
    const messages = await lint(
      'author',
      'import { createApp } from "@company/mfe-react"; export function View() { return createApp({ id: "tracer" }); }',
    );
    expect(messages).toContainEqual(
      expect.objectContaining({ ruleId: 'mfe/stable-definitions', severity: 1 }),
    );
  });

  it('permits an MFE-owned Zustand store and rejects framework-owned Zustand', async () => {
    const source = 'export { createStore } from "zustand/vanilla";';
    expect(await lint('author', source)).toEqual([]);
    expect(await lint('framework', source)).toContainEqual(
      expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 }),
    );
  });

  it('prevents author imports of neutral internals and telemetry vendors', async () => {
    for (const target of [
      '@company/mfe-core',
      '@company/mfe-host/internal',
      '@company/mfe-react/internal',
      '@opentelemetry/api',
      '@grafana/faro-web-sdk',
    ]) {
      expect(await lint('author', `export * from '${target}';`)).toContainEqual(
        expect.objectContaining({ ruleId: 'no-restricted-imports' }),
      );
    }
  });

  it('allows the public Rsbuild entry while keeping MF2 subpaths private', async () => {
    expect(
      await lint('author', 'import { mfePlugin } from "@company/mfe-rsbuild"; mfePlugin();'),
    ).toEqual([]);
    expect(await lint('author', 'export * from "@company/mfe-rsbuild/runtime";')).toContainEqual(
      expect.objectContaining({ ruleId: 'no-restricted-imports' }),
    );
  });

  it('allows the documented test-only export', async () => {
    expect(
      await lint(
        'author',
        'export { createMfeTestEnvironment } from "@company/mfe-react/testing";',
      ),
    ).toEqual([]);
  });

  it('requires a rule name and reason for narrow suppressions', async () => {
    expect(
      await lint(
        'framework',
        '// eslint-disable-next-line mfe/no-global-patching\nwindow.fetch = () => Promise.resolve(new Response());',
      ),
    ).toContainEqual(expect.objectContaining({ ruleId: 'eslint-comments/require-description' }));
    expect(
      await lint(
        'framework',
        '// eslint-disable-next-line mfe/no-global-patching -- Dependency feasibility fixture intentionally reproduces the existing patch.\nwindow.fetch = () => Promise.resolve(new Response());',
      ),
    ).toEqual([]);
  });
});
