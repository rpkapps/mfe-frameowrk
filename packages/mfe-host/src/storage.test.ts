import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { StorageEventLike } from './storage';
import { createStorageCoordinator } from './storage';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
}

function eventSource() {
  const listeners = new Set<(event: StorageEventLike) => void>();
  return {
    subscribe(listener: (event: StorageEventLike) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event: StorageEventLike) {
      for (const listener of [...listeners]) listener(event);
    },
  };
}

const text = z.string();
const number = z.number();

describe('host storage coordinator', () => {
  it('shares same-id handles and notifications while separating stores and IDs', () => {
    const local = memoryStorage();
    const session = memoryStorage();
    const coordinator = createStorageCoordinator({ local, session, generation: 'g1' });
    const first = coordinator.forDefinition('reports');
    const second = coordinator.forDefinition('reports');
    const firstKey = first.local.subscribeKey('density', text, {
      defaultValue: 'comfortable',
      retention: 'preference',
    });
    const secondKey = second.local.subscribeKey('density', text, {
      defaultValue: 'comfortable',
      retention: 'preference',
    });
    expect(firstKey).toBe(secondKey);
    const listener = vi.fn();
    secondKey.subscribe(listener);
    firstKey.set('compact');
    expect(secondKey.getSnapshot()).toBe('compact');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(
      second.session
        .subscribeKey('density', text, { defaultValue: 'comfortable', retention: 'preference' })
        .get(),
    ).toBeNull();
    expect(
      coordinator
        .forDefinition('other')
        .local.key('density', text, { retention: 'preference' })
        .get(),
    ).toBeNull();
  });

  it('uses exact prefix clear and does not touch unrelated storage', () => {
    const local = memoryStorage();
    const thirdParty = JSON.stringify({ retention: 'session', value: 'do-not-touch' });
    local.setItem('third-party:key', thirdParty);
    const coordinator = createStorageCoordinator({ local, generation: 'g1' });
    const storage = coordinator.forDefinition('reports');
    const key = storage.local.subscribeKey('one', text, {
      defaultValue: 'default',
      retention: 'preference',
    });
    const changed = vi.fn();
    key.subscribe(changed);
    key.set('one');
    storage.local.key('two', text, { retention: 'preference' }).set('two');
    storage.local.clear();
    expect(local.getItem('third-party:key')).toBe(thirdParty);
    expect(key.getSnapshot()).toBe('default');
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('validates defaults and values, and never persists a default read', () => {
    const local = memoryStorage();
    const coordinator = createStorageCoordinator({ local, generation: 'g1' });
    const storage = coordinator.forDefinition('settings');
    const key = storage.local.subscribeKey('density', z.enum(['comfortable', 'compact']), {
      defaultValue: 'comfortable',
      retention: 'preference',
    });
    expect(key.get()).toBeNull();
    expect(key.getSnapshot()).toBe('comfortable');
    expect(local.getItem('settings:density')).toBeNull();
    expect(() =>
      storage.local.subscribeKey('broken', text, { defaultValue: 1 as unknown as string }),
    ).toThrow(/default value/);
    expect(() => key.set(1 as unknown as 'comfortable')).toThrow(/schema validation/);
    expect(local.getItem('settings:density')).toBeNull();
  });

  it('resolves updater writes from the latest valid representation and suppresses serialized no-ops', () => {
    const local = memoryStorage();
    const coordinator = createStorageCoordinator({ local, generation: 'g1' });
    const key = coordinator.forDefinition('counter').local.subscribeKey('value', number, {
      defaultValue: 0,
      retention: 'preference',
    });
    const listener = vi.fn();
    key.subscribe(listener);
    key.set(1);
    key.set((value) => value! + 1);
    key.set(2);
    expect(key.getSnapshot()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('routes browser events only to the exact active binding and caches parsed values', () => {
    const local = memoryStorage();
    const source = eventSource();
    const parse = vi.fn((value: unknown) => text.parse(value));
    const coordinator = createStorageCoordinator({
      local,
      generation: 'g1',
      subscribeStorageEvents: (listener) => source.subscribe(listener),
    });
    const storage = coordinator.forDefinition('events');
    const first = storage.local.key('first', { parse } as unknown as typeof text, {
      retention: 'preference',
    });
    const second = storage.local.key('second', text, { retention: 'preference' });
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    first.subscribe(firstListener);
    second.subscribe(secondListener);
    const raw = JSON.stringify({
      marker: '@company/mfe-storage/v1',
      version: 1,
      retention: 'preference',
      value: 'updated',
    });
    local.setItem('events:first', raw);
    source.emit({ key: 'events:first', newValue: raw, storageArea: local });
    expect(first.getSnapshot()).toBe('updated');
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).not.toHaveBeenCalled();
    source.emit({ key: 'events:first', newValue: raw, storageArea: local });
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('requires a generation for session retained reads and fences both stores on transition', () => {
    const local = memoryStorage();
    const session = memoryStorage();
    const coordinator = createStorageCoordinator({ local, session, generation: 'g1' });
    const storage = coordinator.forDefinition('mounted');
    const sessionKey = storage.local.subscribeKey('draft', text, { defaultValue: 'empty' });
    const preferenceKey = storage.local.subscribeKey('density', text, {
      defaultValue: 'comfortable',
      retention: 'preference',
    });
    const listener = vi.fn();
    sessionKey.subscribe(listener);
    sessionKey.set('old');
    preferenceKey.set('compact');
    const unmounted = JSON.stringify({
      marker: '@company/mfe-storage/v1',
      version: 1,
      retention: 'session',
      generation: 'g1',
      value: 'old',
    });
    session.setItem('unmounted:draft', unmounted);
    local.setItem('third-party:key', JSON.stringify({ retention: 'session' }));
    coordinator.transition('g2');
    expect(sessionKey.getSnapshot()).toBe('empty');
    expect(preferenceKey.getSnapshot()).toBe('compact');
    expect(session.getItem('unmounted:draft')).toBeNull();
    expect(local.getItem('third-party:key')).not.toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('migrates once, preserves failures, and rejects future or unsupported records', () => {
    const local = memoryStorage();
    const coordinator = createStorageCoordinator({ local, generation: 'g1' });
    const storage = coordinator.forDefinition('migrations');
    local.setItem(
      'migrations:value',
      JSON.stringify({
        marker: '@company/mfe-storage/v1',
        version: 1,
        retention: 'preference',
        value: 'old',
      }),
    );
    const beforeMigration = local.getItem('migrations:value');
    const migrate = vi.fn((value: unknown) => `${String(value)}-new`);
    const key = storage.local.key('value', text, { retention: 'preference', version: 2, migrate });
    expect(key.get()).toBe('old-new');
    expect(key.get()).toBe('old-new');
    expect(migrate).toHaveBeenCalledTimes(1);
    const beforeFailure = beforeMigration;
    local.setItem(
      'migrations:future',
      JSON.stringify({
        marker: '@company/mfe-storage/v1',
        version: 99,
        retention: 'preference',
        value: 'future',
      }),
    );
    const future = storage.local.key('future', text, { retention: 'preference' });
    expect(() => future.get()).toThrow(/future version/);
    expect(local.getItem('migrations:value')).not.toBe(beforeFailure);
    expect(() =>
      storage.local.key('value', text, { retention: 'preference', version: 3 }).get(),
    ).toThrow(/conflicting/);
  });

  it('does not commit a migration after a reentrant generation transition', () => {
    const local = memoryStorage();
    const coordinator = createStorageCoordinator({ local, generation: 'g1' });
    const storage = coordinator.forDefinition('race');
    local.setItem(
      'race:value',
      JSON.stringify({
        marker: '@company/mfe-storage/v1',
        version: 1,
        retention: 'preference',
        value: 'old',
      }),
    );
    const migrate = () => {
      coordinator.transition('g2');
      return 'new';
    };
    const key = storage.local.key('value', text, { retention: 'preference', version: 2, migrate });
    expect(() => key.get()).toThrow(/retired generation/);
    const storedRace = JSON.parse(local.getItem('race:value')!) as { readonly version?: unknown };
    expect(storedRace.version).toBe(1);
  });
  it('rejects markerless records and imperative defaults explicitly', () => {
    const local = memoryStorage();
    const coordinator = createStorageCoordinator({ local, generation: 'g1' });
    const storage = coordinator.forDefinition('strict');
    local.setItem(
      'strict:value',
      JSON.stringify({ version: 1, retention: 'preference', value: 'old' }),
    );
    const key = storage.local.key('value', text, { retention: 'preference' });
    expect(() => key.get()).toThrow(/invalid framework envelope/);
    expect(() =>
      storage.local.key('other', text, { defaultValue: 'bad' } as unknown as {
        retention: 'preference';
      }),
    ).toThrow(/subscribed binding/);
  });
  it('rejects reuse of a retired generation even when physical deletion was incomplete', () => {
    const local = memoryStorage();
    const coordinator = createStorageCoordinator({ local, generation: 'g1' });
    coordinator.transition('g2');
    expect(() => coordinator.transition('g1')).toThrow(/already retired/);
  });
  it('refreshes between snapshot read and subscription without duplicate notifications', () => {
    const local = memoryStorage();
    const coordinator = createStorageCoordinator({ local, generation: 'g1' });
    const key = coordinator
      .forDefinition('race')
      .local.key('value', text, { retention: 'preference' });
    expect(key.getSnapshot()).toBeNull();
    local.setItem(
      'race:value',
      JSON.stringify({
        marker: '@company/mfe-storage/v1',
        version: 1,
        retention: 'preference',
        value: 'new',
      }),
    );
    const listener = vi.fn();
    key.subscribe(listener);
    expect(key.getSnapshot()).toBe('new');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('returns transition status and rejects reuse of retired generations', () => {
    const local = memoryStorage();
    const coordinator = createStorageCoordinator({ local, generation: 'g1' });
    expect(coordinator.transition('g1')).toBe(false);
    expect(coordinator.transition('g2')).toBe(true);
    expect(() => coordinator.transition('g1')).toThrow(/already retired/);
  });

  it('disposes existing bindings, listeners, and queued events', () => {
    const local = memoryStorage();
    const source = eventSource();
    const coordinator = createStorageCoordinator({
      local,
      generation: 'g1',
      subscribeStorageEvents: (listener) => source.subscribe(listener),
    });
    const key = coordinator.forDefinition('disposed').local.key('value', text, {
      retention: 'preference',
    });
    const listener = vi.fn();
    key.subscribe(listener);
    key.set('before');
    coordinator.dispose();
    local.setItem(
      'disposed:value',
      JSON.stringify({
        marker: '@company/mfe-storage/v1',
        version: 1,
        retention: 'preference',
        value: 'after',
      }),
    );
    source.emit({
      key: 'disposed:value',
      newValue: local.getItem('disposed:value'),
      storageArea: local,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => key.get()).toThrow(/disposed/);
  });

  it('preserves a failed migration record and surfaces the structured error', () => {
    const local = memoryStorage();
    const coordinator = createStorageCoordinator({ local, generation: 'g1' });
    const raw = JSON.stringify({
      marker: '@company/mfe-storage/v1',
      version: 1,
      retention: 'preference',
      value: 'old',
    });
    local.setItem('migration-failure:value', raw);
    const key = coordinator.forDefinition('migration-failure').local.key('value', text, {
      retention: 'preference',
      version: 2,
      migrate: () => {
        throw new Error('bad migration');
      },
    });
    expect(() => key.get()).toThrow(/migration failed/);
    expect(local.getItem('migration-failure:value')).toBe(raw);
  });

  it('keeps the raw record and cached value when a quota write fails', () => {
    const local = memoryStorage();
    const diagnostics: unknown[] = [];
    const coordinator = createStorageCoordinator({
      local,
      generation: 'g1',
      reportError: (error) => diagnostics.push(error),
    });
    const key = coordinator.forDefinition('quota').local.key('value', text, {
      retention: 'preference',
    });
    key.set('before');
    const raw = local.getItem('quota:value');
    const originalSetItem = local.setItem.bind(local);
    local.setItem = (name, value) => {
      if (name === 'quota:value') throw new Error('quota exceeded');
      originalSetItem(name, value);
    };
    expect(() => key.set('after')).toThrow(/storage access failed/);
    expect(local.getItem('quota:value')).toBe(raw);
    expect(key.get()).toBe('before');
    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'storage/failure' })]),
    );
  });

  it('fences old data when transition deletion is blocked and a stale event arrives', () => {
    const local = memoryStorage();
    const source = eventSource();
    const diagnostics: unknown[] = [];
    const coordinator = createStorageCoordinator({
      local,
      generation: 'g1',
      subscribeStorageEvents: (listener) => source.subscribe(listener),
      reportError: (error) => diagnostics.push(error),
    });
    const storage = coordinator.forDefinition('blocked');
    const draft = storage.local.subscribeKey('draft', text, { defaultValue: 'empty' });
    const preference = storage.local.subscribeKey('density', text, {
      defaultValue: 'comfortable',
      retention: 'preference',
    });
    draft.set('old');
    preference.set('compact');
    const staleRaw = local.getItem('blocked:draft');
    const originalRemoveItem = local.removeItem.bind(local);
    local.removeItem = (name) => {
      if (name === 'blocked:draft') throw new Error('blocked deletion');
      originalRemoveItem(name);
    };
    local.setItem('third-party:key', 'preserve');
    coordinator.transition('g2');
    source.emit({ key: 'blocked:draft', newValue: staleRaw, storageArea: local });
    expect(draft.getSnapshot()).toBe('empty');
    expect(preference.getSnapshot()).toBe('compact');
    expect(local.getItem('blocked:draft')).toBe(staleRaw);
    expect(local.getItem('third-party:key')).toBe('preserve');
    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'storage/failure' })]),
    );
  });

  it('caches external malformed, schema-invalid, and clear-read failures as errors', () => {
    const local = memoryStorage();
    const source = eventSource();
    const coordinator = createStorageCoordinator({
      local,
      generation: 'g1',
      subscribeStorageEvents: (listener) => source.subscribe(listener),
    });
    const storage = coordinator.forDefinition('external');
    const malformed = storage.local.key('malformed', text, { retention: 'preference' });
    const invalid = storage.local.key('invalid', text, { retention: 'preference' });
    const cleared = storage.local.key('cleared', text, { retention: 'preference' });
    const malformedListener = vi.fn();
    const invalidListener = vi.fn();
    const clearedListener = vi.fn();
    malformed.subscribe(malformedListener);
    invalid.subscribe(invalidListener);
    cleared.subscribe(clearedListener);
    malformed.getSnapshot();
    invalid.getSnapshot();
    cleared.getSnapshot();
    local.setItem('external:malformed', '{bad');
    source.emit({ key: 'external:malformed', newValue: '{bad', storageArea: local });
    expect(() => malformed.getSnapshot()).toThrow(/malformed JSON/);
    const invalidRaw = JSON.stringify({
      marker: '@company/mfe-storage/v1',
      version: 1,
      retention: 'preference',
      value: 42,
    });
    local.setItem('external:invalid', invalidRaw);
    source.emit({ key: 'external:invalid', newValue: invalidRaw, storageArea: local });
    expect(() => invalid.getSnapshot()).toThrow(/schema validation failed/);
    expect(malformedListener).toHaveBeenCalledTimes(1);
    expect(invalidListener).toHaveBeenCalledTimes(1);
    const originalGetItem = local.getItem.bind(local);
    local.getItem = (name) => {
      if (name === 'external:cleared') throw new Error('read blocked');
      return originalGetItem(name);
    };
    source.emit({ key: null, newValue: null, storageArea: local });
    expect(() => cleared.getSnapshot()).toThrow(/storage access failed/);
    expect(clearedListener).toHaveBeenCalledTimes(1);
  });
});
