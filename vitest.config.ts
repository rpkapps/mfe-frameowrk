import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '#mfe/config': resolve(root, 'tests/gate-three/config-fixture.ts'),
      '#mfe/fetch': resolve(root, 'tests/gate-three/fetch-fixture.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.{ts,tsx,js,mjs}', 'tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/conformance/**'],
    restoreMocks: true,
    clearMocks: true,
    setupFiles: ['./tests/gate-three/setup.ts'],
  },
});
