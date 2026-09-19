import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '@company/mfe-react/testing';

describe('supported author test fixtures', () => {
  it('provides isolated browser-storage semantics with deterministic ordering', () => {
    const first = new MemoryStorage();
    const second = new MemoryStorage();
    first.setItem('inventory:filter', 'ops');

    expect(first.getItem('inventory:filter')).toBe('ops');
    expect(second.getItem('inventory:filter')).toBeNull();
    expect(first.key(0)).toBe('inventory:filter');
    expect(first.length).toBe(1);
    first.removeItem('inventory:filter');
    expect(first.length).toBe(0);
  });

  it('keeps disposal and clear operations idempotent for fixture callers', () => {
    const storage = new MemoryStorage();
    storage.setItem('key', 'value');
    storage.clear();
    storage.clear();
    expect(storage.length).toBe(0);
    expect(storage.getItem('key')).toBeNull();
  });
});
