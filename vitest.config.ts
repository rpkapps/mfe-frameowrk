import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.{ts,tsx,js,mjs}', 'tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/conformance/**'],
    restoreMocks: true,
    clearMocks: true,
  },
});
