import globals from 'globals';
import mfe from '@company/eslint-plugin-mfe';

export default [
  {
    ignores: [
      'vendor/tecton-react/**',
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
  ...['introductory-app', 'discovery-app', 'geology-app'].flatMap((fixture) =>
    mfe.configs.author.map((config) => ({
      ...config,
      files: config.files?.map((pattern) => `fixtures/${fixture}/${pattern}`),
    })),
  ),
  {
    name: 'workspace/gate-three-host-assembly',
    files: ['fixtures/test-shell/src/gate-three-scale.tsx'],
    rules: { 'mfe/no-widget-global-effects': 'error' },
  },
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
