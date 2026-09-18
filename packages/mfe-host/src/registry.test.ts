import { describe, expect, it } from 'vitest';
import { normalizeRegistry, selectAdapter } from './registry';

describe('neutral registry normalization', () => {
  it('keeps valid entries and quarantines malformed advertised contracts', () => {
    const result = normalizeRegistry([
      { id: 'app', kind: 'app', contractMajor: 1, version: '1.0.0', privateField: 'hidden' },
      { id: 'broken', kind: 'app', contractMajor: 2 },
      { id: 'typo', kind: 'future', contractMajor: 1 },
    ]);
    expect(result.entries).toEqual([
      { id: 'app', kind: 'app', version: '1.0.0', contractMajor: 1 },
    ]);
    expect(result.quarantined).toHaveLength(2);
    expect(result.quarantined.map(({ error }) => error.code)).toEqual([
      'contract/unsupported-major',
      'registry/invalid-descriptor',
    ]);
  });

  it('rejects every member of an ID collision deterministically', () => {
    const result = normalizeRegistry([
      { id: 'same', kind: 'app', contractMajor: 1 },
      { id: 'same', kind: 'widget', contractMajor: 1 },
      { id: 'same', kind: 'app', contractMajor: 1 },
      { id: 'ok', kind: 'widget', contractMajor: 1 },
    ]);
    expect(result.entries.map(({ id }) => id)).toEqual(['ok']);
    expect(
      result.quarantined.filter(({ error }) => error.code === 'registry/duplicate-id'),
    ).toHaveLength(3);
  });

  it('does not reinterpret contract metadata with a missing kind as legacy', () => {
    const result = normalizeRegistry([{ id: 'broken', contractMajor: 1, legacy: {} }]);
    expect(result.entries).toHaveLength(0);
    expect(result.quarantined[0]?.error.code).toBe('registry/invalid-descriptor');
  });

  it('selects by normalized kind through the adapter table', () => {
    expect(selectAdapter({ id: 'x', kind: 'app' })).toBe('app');
    expect(selectAdapter({ id: 'x', kind: 'widget' })).toBe('widget');
  });
});

describe('new contract advertisement boundaries', () => {
  it.each([
    { id: 'missing-kind', contractMajor: 1, legacyMarker: true },
    { id: 'undefined-kind', kind: undefined, contractMajor: 1, legacyMarker: true },
    { id: 'undefined-major', kind: 'app', contractMajor: undefined, legacyMarker: true },
    { id: 'no-metadata', legacyMarker: true },
  ])('quarantines descriptors without a valid advertised contract: %j', (descriptor) => {
    const result = normalizeRegistry([descriptor]);
    expect(result.entries).toHaveLength(0);
    expect(result.quarantined[0]?.error.code).toBe(
      descriptor.id === 'undefined-major'
        ? 'contract/unsupported-major'
        : 'registry/invalid-descriptor',
    );
  });

  it('quarantines a throwing descriptor accessor while retaining a healthy neighbor', () => {
    const broken = {
      id: 'broken',
      contractMajor: 1,
      get kind(): never {
        throw new Error('descriptor getter failed');
      },
    };
    const result = normalizeRegistry([broken, { id: 'healthy', kind: 'app', contractMajor: 1 }]);
    expect(result.entries).toEqual([{ id: 'healthy', kind: 'app', contractMajor: 1 }]);
    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0]?.error.code).toBe('registry/invalid-descriptor');
    expect(result.quarantined[0]?.error.cause).toBeInstanceOf(Error);
  });

  it('requires contract metadata to be own advertised fields', () => {
    const inherited = Object.create({ kind: 'app', contractMajor: 1 }) as { id: string };
    inherited.id = 'inherited';
    const result = normalizeRegistry([inherited]);
    expect(result.entries).toHaveLength(0);
    expect(result.quarantined[0]?.error.code).toBe('registry/invalid-descriptor');
  });

  it('uses the structured unsupported-major error for an advertised incompatible major', () => {
    const result = normalizeRegistry([{ id: 'future', kind: 'app', contractMajor: 99 }]);
    expect(result.quarantined[0]?.error.code).toBe('contract/unsupported-major');
  });

  it('quarantines malformed and valid entries together when they share an ID', () => {
    const result = normalizeRegistry([
      { id: 'same', kind: 'app', contractMajor: 1 },
      { id: 'same', kind: undefined, contractMajor: 1 },
      { id: 'healthy', kind: 'widget', contractMajor: 1 },
    ]);
    expect(result.entries).toEqual([{ id: 'healthy', kind: 'widget', contractMajor: 1 }]);
    expect(result.quarantined).toHaveLength(2);
    expect(result.quarantined.every(({ error }) => error.code === 'registry/duplicate-id')).toBe(
      true,
    );
  });
});
