import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { cleanupMfeTests } from '@company/mfe-react/testing';
import { resetTestConfig } from './config-fixture';
import { resetTestFetch } from './fetch-fixture';

afterEach(async () => {
  await cleanupMfeTests();
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  resetTestConfig();
  resetTestFetch();
});
