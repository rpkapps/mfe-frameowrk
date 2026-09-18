import globals from 'globals';
import mfe from '@company/eslint-plugin-mfe';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/routeTree.gen.ts',
      '**/.mfe/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  ...mfe.configs.framework,
  ...mfe.configs.author.map((config) => ({
    ...config,
    files: config.files?.map((pattern) => `fixtures/introductory-app/${pattern}`),
  })),
  {
    name: 'workspace/node-tooling',
    files: [
      '**/*.mjs',
      '**/*.config.{js,ts}',
      'scripts/**/*.{js,ts}',
      'packages/eslint-plugin-mfe/**/*.js',
      '**/*.test.{js,ts,tsx}',
    ],
    languageOptions: { globals: globals.node },
  },
];
