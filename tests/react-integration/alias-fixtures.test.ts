// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { config } from '#mfe/config';
import { configureTestConfig } from './config-fixture';
import { fetch } from '#mfe/fetch';
import { getFixtureRequests } from './fetch-fixture';

describe('generated author aliases', () => {
  it('provides typed config and a controlled fetch boundary', async () => {
    configureTestConfig({ persona: 'alias-test' });
    expect(config.persona).toBe('alias-test');
    const response = await fetch('/fixture', { method: 'GET' });
    expect(response.ok).toBe(true);
    expect(getFixtureRequests()).toHaveLength(1);
  });
});
