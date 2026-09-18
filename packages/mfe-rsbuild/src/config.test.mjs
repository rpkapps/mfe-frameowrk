import { createRsbuild } from '@rsbuild/core';
import { expect, it, vi } from 'vitest';
import { sharedReactPlugin } from './index.mjs';

const root = new URL('../../../fixtures/discovery-app/', import.meta.url).pathname;

async function inspect(postcss) {
  const rsbuild = await createRsbuild({
    cwd: root,
    rsbuildConfig: {
      source: { entry: { index: './src/mfe.ts' } },
      tools: { postcss },
      plugins: sharedReactPlugin({ root, scope: 'discovery' }),
    },
  });
  return rsbuild.inspectConfig();
}

function postcssOptions(inspected) {
  const rules = inspected.origin.bundlerConfigs[0].module.rules;
  let options;
  const visit = (items) =>
    items.forEach((rule) => {
      if (rule.oneOf) visit(rule.oneOf);
      for (const loader of [].concat(rule.use ?? [])) {
        if (String(loader.loader).includes('postcss-loader')) options = loader.options;
      }
    });
  visit(rules);
  return options;
}

it('preserves object PostCSS options and appends scoped processing last', async () => {
  const user = { postcssPlugin: 'user-object-plugin' };
  const inspected = await inspect({ postcssOptions: { plugins: [user], customFlag: true } });
  const options = postcssOptions(inspected);
  expect(options.postcssOptions.customFlag).toBe(true);
  const plugins = options.postcssOptions.plugins;
  expect(plugins[0]).toBe(user);
  expect(plugins.at(-1).postcssPlugin).toBe('mfe-scoped-css');
});

it('preserves returning PostCSS functions and compiler source coverage', async () => {
  const user = vi.fn(() => ({
    postcssOptions: { plugins: [{ postcssPlugin: 'user-function-plugin' }] },
  }));
  const inspected = await inspect(user);
  const options = postcssOptions(inspected);
  expect(user).toHaveBeenCalled();
  expect(options.postcssOptions.plugins[0].postcssPlugin).toBe('user-function-plugin');
  expect(options.postcssOptions.plugins.at(-1).postcssPlugin).toBe('mfe-scoped-css');
  const rules = inspected.origin.bundlerConfigs[0].module.rules;
  let babelRule;
  const visit = (items) =>
    items.forEach((rule) => {
      if (rule.oneOf) visit(rule.oneOf);
      if (
        [].concat(rule.use ?? []).some((loader) => String(loader.loader).includes('babel-loader'))
      )
        babelRule = rule;
    });
  visit(rules);
  expect(babelRule.include).toContain(`${root}src`);
  expect(
    babelRule.include.some(
      (entry) => typeof entry === 'string' && entry.includes('/packages/mfe-react/src'),
    ),
  ).toBe(true);
  expect(
    babelRule.include.some(
      (entry) =>
        entry instanceof RegExp && entry.test('/node_modules/@tecton/react/src/button.tsx'),
    ),
  ).toBe(true);
});
