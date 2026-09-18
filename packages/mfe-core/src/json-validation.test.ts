import { describe, expect, it } from 'vitest';

import { findJsonValidationIssue, freezeJsonValue, isJsonSerializable } from '@company/mfe-core';

describe('JSON boundary validation', () => {
  it('rejects unsupported values with a nested path and cycles', () => {
    expect(findJsonValidationIssue({ payload: new Date() })).toMatchObject({
      path: ['payload'],
      reason: 'class-instance',
    });
    expect(findJsonValidationIssue({ payload: Number.NaN })).toMatchObject({
      path: ['payload'],
      reason: 'nonfinite-number',
    });
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(findJsonValidationIssue(cycle)).toMatchObject({ path: ['self'], reason: 'cycle' });
  });

  it('does not invoke accessors while checking arrays and freezes descendants', () => {
    let reads = 0;
    const array = [] as unknown[];
    Object.defineProperty(array, '0', {
      enumerable: true,
      get() {
        reads += 1;
        return 'value';
      },
    });
    expect(findJsonValidationIssue(array)).toMatchObject({ path: [0], reason: 'accessor' });
    expect(reads).toBe(0);

    const value = { nested: { value: 1 } };
    freezeJsonValue(value);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.nested)).toBe(true);
    expect(isJsonSerializable(value)).toBe(true);
  });
});
