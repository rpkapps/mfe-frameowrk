import js from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import router from '@tanstack/eslint-plugin-router';
import query from '@tanstack/eslint-plugin-query';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import noGlobalPatching from './rules/no-global-patching.js';
import noRawStorage from './rules/no-raw-storage.js';
import stableDefinitions from './rules/stable-definitions.js';
import noWidgetGlobalEffects from './rules/no-widget-global-effects.js';

const sourceFiles = ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'];
const typescriptFiles = ['**/*.{ts,mts,cts,tsx}'];

const plugin = {
  meta: { name: '@company/eslint-plugin-mfe', version: '0.1.0' },
  rules: {
    'no-global-patching': noGlobalPatching,
    'no-raw-storage': noRawStorage,
    'stable-definitions': stableDefinitions,
    'no-widget-global-effects': noWidgetGlobalEffects,
  },
  configs: {},
};

const vendorPatterns = ['@opentelemetry/*', '@grafana/faro-*'];
const statePatterns = [
  'zustand',
  'zustand/*',
  'redux',
  '@reduxjs/*',
  'react-redux',
  'mobx',
  'mobx-*',
  'jotai',
  'jotai/*',
  '@tanstack/store',
  '@tanstack/react-store',
];

function imports(patterns, message) {
  return ['error', { patterns: [{ group: patterns, message, allowTypeImports: false }] }];
}

function foundation() {
  return [
    {
      name: 'mfe/source-baseline',
      files: sourceFiles,
      languageOptions: { globals: globals.browser },
      plugins: { mfe: plugin, 'eslint-comments': eslintComments },
      linterOptions: { reportUnusedDisableDirectives: 'error' },
      rules: {
        ...js.configs.recommended.rules,
        'mfe/no-global-patching': 'error',
        'no-shadow': 'error',
        'eslint-comments/no-unlimited-disable': 'error',
        'eslint-comments/require-description': 'error',
      },
    },
    ...tseslint.configs.recommendedTypeChecked.map((config) => ({
      ...config,
      files: typescriptFiles,
    })),
    {
      name: 'mfe/typed-correctness',
      files: typescriptFiles,
      languageOptions: { parserOptions: { projectService: true } },
      rules: {
        'no-shadow': 'off',
        '@typescript-eslint/no-shadow': 'error',
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-unnecessary-type-assertion': 'error',
        '@typescript-eslint/switch-exhaustiveness-check': 'error',
        '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }],
      },
    },
    {
      name: 'mfe/react-correctness',
      // Hooks and createElement components also live in ordinary .ts/.js files.
      // The upstream rules identify React constructs rather than filename ownership.
      files: sourceFiles,
      plugins: { 'react-hooks': reactHooks },
      rules: {
        ...reactHooks.configs.flat.recommended.rules,
        'react-hooks/exhaustive-deps': 'error',
        // These diagnose skipped optimizations, not incorrect React execution.
        'react-hooks/unsupported-syntax': 'warn',
        'react-hooks/incompatible-library': 'warn',
      },
    },
    {
      name: 'mfe/tanstack-conventions',
      files: typescriptFiles,
      plugins: { '@tanstack/router': router, '@tanstack/query': query },
      rules: {
        ...router.configs['flat/recommended'][0].rules,
        ...query.configs['flat/recommended'][0].rules,
      },
    },
  ];
}

plugin.configs.framework = [
  ...foundation(),
  {
    name: 'mfe/framework-import-boundaries',
    files: sourceFiles,
    rules: {
      'no-restricted-imports': imports(
        [...vendorPatterns, ...statePatterns],
        'Framework implementation state uses purpose-specific structures. Telemetry vendors belong only to the shell integration.',
      ),
    },
  },
];

plugin.configs.author = [
  ...foundation(),
  {
    name: 'mfe/author-import-boundaries',
    files: sourceFiles,
    rules: {
      'mfe/stable-definitions': 'warn',
      'no-restricted-imports': imports(
        [
          ...vendorPatterns,
          '@company/mfe-core',
          '@company/mfe-core/*',
          '@company/mfe-host',
          '@company/mfe-host/*',
          '@company/mfe-legacy-angular',
          '@company/mfe-legacy-angular/*',
          '@company/mfe-react/*',
          '!@company/mfe-react/testing',
          '@company/mfe-rsbuild/*',
        ],
        'Use the public @company/mfe-react or @company/mfe-rsbuild exports. Telemetry uses framework-owned exports.',
      ),
    },
  },
  {
    name: 'mfe/author-storage-boundary',
    files: sourceFiles,
    rules: {
      'mfe/no-raw-storage': 'error',
    },
  },
];

// Projects opt into this narrow scope with their own explicit source globs:
// `...mfe.configs.authorWidget(['src/panels/**'])`. We do not infer Widget
// ownership from filenames or enable browser-global checks for all authors.
plugin.configs.authorWidget = (files = []) => [
  ...plugin.configs.author,
  {
    name: 'mfe/widget-global-effects',
    files,
    rules: { 'mfe/no-widget-global-effects': 'error' },
  },
];

export default plugin;
