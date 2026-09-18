import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/conformance/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
  },
});
