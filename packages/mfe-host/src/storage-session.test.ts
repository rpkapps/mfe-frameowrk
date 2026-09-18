import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createStorageCoordinator } from './storage';
import {
  hasStorageSessionChanged,
  transitionStorageSession,
  type StorageSessionMetadata,
} from './storage-session';

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

const text = z.string();
const firstSession: StorageSessionMetadata = {
  principalId: 'user-1',
  accountId: 'account-1',
  tenantId: 'tenant-1',
  groups: ['reader', 'analyst'],
};

describe('storage session transitions', () => {
  it('compares identity fields and groups as a semantic set', () => {
    expect(
      hasStorageSessionChanged(firstSession, {
        ...firstSession,
        groups: ['analyst', 'reader'],
      }),
    ).toBe(false);
    expect(
      hasStorageSessionChanged(firstSession, {
        ...firstSession,
        groups: ['reader', 'writer'],
      }),
    ).toBe(true);
    expect(
      hasStorageSessionChanged(firstSession, { ...firstSession, accountId: 'account-2' }),
    ).toBe(true);
    expect(hasStorageSessionChanged(firstSession, { ...firstSession, tenantId: 'tenant-2' })).toBe(
      true,
    );
    expect(hasStorageSessionChanged(firstSession, { ...firstSession, principalId: null })).toBe(
      true,
    );
  });

  it('retires session values before the publish callback on a semantic transition', () => {
    const local = memoryStorage();
    const session = memoryStorage();
    const coordinator = createStorageCoordinator({ local, session, generation: 'generation-1' });
    const storage = coordinator.forDefinition('reports');
    const sessionKey = storage.local.subscribeKey('draft', text, { defaultValue: 'empty' });
    const preferenceKey = storage.local.subscribeKey('density', text, {
      defaultValue: 'comfortable',
      retention: 'preference',
    });
    sessionKey.subscribe(() => {});
    sessionKey.set('old draft');
    preferenceKey.set('compact');

    let observedDuringPublish: string | null | undefined;
    const changed = transitionStorageSession({
      coordinator,
      previous: firstSession,
      next: { ...firstSession, accountId: 'account-2' },
      generation: 'generation-2',
      publish: () => {
        observedDuringPublish = sessionKey.getSnapshot();
      },
    });

    expect(changed).toBe(true);
    expect(observedDuringPublish).toBe('empty');
    expect(sessionKey.getSnapshot()).toBe('empty');
    expect(preferenceKey.getSnapshot()).toBe('compact');

    const stalePublish = vi.fn();
    expect(() =>
      transitionStorageSession({
        coordinator,
        previous: { ...firstSession, accountId: 'account-2' },
        next: firstSession,
        generation: 'generation-1',
        publish: stalePublish,
      }),
    ).toThrow(expect.objectContaining({ code: 'storage/failure' }));
    expect(stalePublish).not.toHaveBeenCalled();
  });

  it('does not reset storage for reordered groups, token refresh, or theme-only publication', () => {
    const local = memoryStorage();
    const coordinator = createStorageCoordinator({ local, generation: 'stable-generation' });
    const storage = coordinator.forDefinition('reports');
    const sessionKey = storage.local.subscribeKey('draft', text, { defaultValue: 'empty' });
    sessionKey.subscribe(() => {});
    sessionKey.set('keep this draft');

    const publish = vi.fn();
    const changed = transitionStorageSession({
      coordinator,
      previous: firstSession,
      next: { ...firstSession, groups: ['analyst', 'reader'] },
      generation: 'stable-generation',
      publish,
    });

    expect(changed).toBe(false);
    expect(publish).toHaveBeenCalledOnce();
    expect(sessionKey.getSnapshot()).toBe('keep this draft');

    // Access token and theme are intentionally outside session identity metadata.
    const tokenRefresh = transitionStorageSession({
      coordinator,
      previous: firstSession,
      next: { ...firstSession },
      generation: 'stable-generation',
      publish,
    });
    expect(tokenRefresh).toBe(false);
    expect(sessionKey.getSnapshot()).toBe('keep this draft');
  });

  it('rejects a semantic change when the shell reuses the current generation', () => {
    const local = memoryStorage();
    const coordinator = createStorageCoordinator({ local, generation: 'generation-1' });
    const storage = coordinator.forDefinition('reports');
    const sessionKey = storage.local.subscribeKey('draft', text, { defaultValue: 'empty' });
    sessionKey.subscribe(() => {});
    sessionKey.set('must not publish');
    const publish = vi.fn();

    expect(() =>
      transitionStorageSession({
        coordinator,
        previous: firstSession,
        next: { ...firstSession, principalId: null },
        generation: 'generation-1',
        publish,
      }),
    ).toThrow(expect.objectContaining({ code: 'storage/failure' }));
    expect(publish).not.toHaveBeenCalled();
    expect(sessionKey.getSnapshot()).toBe('must not publish');
  });

  it('keeps a shell-supplied generation stable across reload-shaped coordinators', () => {
    const local = memoryStorage();
    const session = memoryStorage();
    const firstCoordinator = createStorageCoordinator({
      local,
      session,
      generation: 'reload-stable',
    });
    const firstKey = firstCoordinator
      .forDefinition('reports')
      .local.subscribeKey('draft', text, { defaultValue: 'empty' });
    firstKey.subscribe(() => {});
    firstKey.set('survives reload');

    const reloadedCoordinator = createStorageCoordinator({
      local,
      session,
      generation: 'reload-stable',
    });
    const reloadedKey = reloadedCoordinator
      .forDefinition('reports')
      .local.subscribeKey('draft', text, { defaultValue: 'empty' });
    expect(reloadedKey.getSnapshot()).toBe('survives reload');
  });
});
