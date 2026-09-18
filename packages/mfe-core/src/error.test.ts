import { describe, expect, it } from 'vitest';
import { createMfeError, isMfeError } from './error';

describe('structured errors', () => {
  it('names the definition, operation, expected condition, owner and repair without copying the cause message', () => {
    const cause = new Error('potentially sensitive provider detail');
    const error = createMfeError({
      id: 'operations',
      definitionVersion: '2.1.0',
      code: 'app/invalid-base-path',
      operation: 'mount',
      resource: 'router basepath',
      expected: 'the supplied /tracer boundary',
      observed: 'a different prefix',
      owner: 'the App router factory',
      repair: 'Pass the supplied basePath through unchanged.',
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('operations (2.1.0): mount');
    expect(error.message).toContain('router basepath');
    expect(error.message).toContain('Expected the supplied /tracer boundary');
    expect(error.message).toContain('observed a different prefix');
    expect(error.message).toContain('Owned by the App router factory');
    expect(error.message).toContain('Pass the supplied basePath through unchanged.');
    expect(error.message).not.toContain(cause.message);
    expect(error.cause).toBe(cause);
    expect(isMfeError(error)).toBe(true);
  });

  it('copies and freezes the field path and excludes absent metadata', () => {
    const path = ['router', 'basepath'];
    const error = createMfeError({
      id: 'operations',
      code: 'app/invalid-base-path',
      operation: 'mount',
      resource: 'router basepath',
      expected: 'the assigned boundary',
      observed: 'a conflicting value',
      owner: 'the App router factory',
      repair: 'Forward the supplied boundary.',
      path,
    });
    path.push('changed');

    expect(error.path).toEqual(['router', 'basepath']);
    expect(Object.isFrozen(error.path)).toBe(true);
    expect(error).not.toHaveProperty('definitionVersion');
    expect(error).not.toHaveProperty('direction');
  });

  it('rejects malformed error metadata and unknown future codes', () => {
    expect(isMfeError(new Error('ordinary exception'))).toBe(false);
    expect(
      isMfeError(
        Object.assign(new Error(), { code: 'unknown/code', id: 'app', operation: 'mount' }),
      ),
    ).toBe(false);
    expect(
      isMfeError(
        Object.assign(new Error(), {
          code: 'mount/failure',
          id: 'app',
          operation: 'mount',
          path: [null],
        }),
      ),
    ).toBe(false);
  });
});
