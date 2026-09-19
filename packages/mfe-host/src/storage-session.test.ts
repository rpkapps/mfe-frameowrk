import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createInternalStorageCoordinator } from '@company/mfe-host/internal';
import {
  createShellSession,
  hasStorageSessionChanged,
  transitionStorageSession,
  type StorageSessionMetadata,
} from './storage-session';
import { createShellState } from './shell-state';

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
  it('retires every registered mount once before storage transition and publish', () => {
    const order: string[] = [];
    const store = createShellState({
      user: { id: 'u-1', name: 'One' },
      groups: ['reader'],
      theme: 'light',
    });
    const coordinator = {
      transition: vi.fn(() => {
        order.push('storage');
        return true;
      }),
    };
    const session = createShellSession({
      coordinator,
      createGeneration: () => 'generation-2',
      initial: store.getSnapshot(),
      store,
    });
    const unregister = session.registerQueryRetirer(() => order.push('retire:first'));
    session.registerQueryRetirer(() => order.push('retire:second'));
    store.subscribe(() => order.push('publish'));

    expect(
      session.update({ user: { id: 'u-2', name: 'Two' }, groups: ['reader'], theme: 'dark' }),
    ).toBe(true);
    expect(order).toEqual(['retire:first', 'retire:second', 'storage', 'publish']);
    expect(coordinator.transition).toHaveBeenCalledOnce();
    unregister();
    expect(
      session.update({ user: { id: 'u-2', name: 'Two' }, groups: ['reader'], theme: 'light' }),
    ).toBe(true);
    expect(coordinator.transition).toHaveBeenCalledOnce();
  });

  it('treats group reordering as a no-op and removes retired callbacks', () => {
    const retire = vi.fn();
    const session = createShellSession({
      coordinator: { transition: vi.fn(() => true) },
      createGeneration: () => 'generation-2',
      initial: { user: null, groups: ['reader', 'analyst'], theme: 'light' },
    });
    const unregister = session.registerQueryRetirer(retire);
    expect(session.update({ user: null, groups: ['analyst', 'reader'], theme: 'dark' })).toBe(true);
    expect(retire).not.toHaveBeenCalled();
    unregister();
    expect(
      session.update({ user: { id: 'u-2', name: 'Two' }, groups: ['reader'], theme: 'dark' }),
    ).toBe(true);
    expect(retire).not.toHaveBeenCalled();
  });

  it('disposes the store and rejects later registrations or updates', () => {
    const session = createShellSession({
      coordinator: { transition: vi.fn(() => true) },
      createGeneration: () => 'generation-2',
      initial: { user: null, groups: [], theme: 'light' },
    });
    session.dispose();
    expect(() =>
      session.registerQueryRetirer(() => {
        throw new Error('must not run');
      }),
    ).not.toThrow();
    expect(session.update({ user: { id: 'late', name: 'Late' }, groups: [], theme: 'dark' })).toBe(
      false,
    );
    expect(session.getSnapshot()).toEqual({ user: null, groups: [], theme: 'light' });
  });

  it('does not transition or publish when a query retiree fails', () => {
    const store = createShellState({ user: null, groups: [], theme: 'light' });
    const transition = vi.fn(() => true);
    const session = createShellSession({
      coordinator: { transition },
      createGeneration: () => 'generation-2',
      initial: store.getSnapshot(),
      store,
    });
    session.registerQueryRetirer(() => {
      throw new Error('retirement failed');
    });
    expect(() =>
      session.update({ user: { id: 'u-2', name: 'Two' }, groups: [], theme: 'dark' }),
    ).toThrow(expect.objectContaining({ code: 'storage/failure' }));
    expect(transition).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toEqual({ user: null, groups: [], theme: 'light' });
  });

  it.each([undefined, null])('fails closed when a retiree throws %s', (cause) => {
    const store = createShellState({ user: null, groups: [], theme: 'light' });
    const transition = vi.fn(() => true);
    const session = createShellSession({
      coordinator: { transition },
      createGeneration: () => 'generation-2',
      initial: store.getSnapshot(),
      store,
    });
    session.registerQueryRetirer(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- fail-closed regression covers arbitrary callback throws.
      throw cause;
    });
    expect(() =>
      session.update({ user: { id: 'u-2', name: 'Two' }, groups: [], theme: 'dark' }),
    ).toThrow(expect.objectContaining({ code: 'storage/failure' }));
    expect(transition).not.toHaveBeenCalled();
    expect(session.getSnapshot().user).toBeNull();
  });
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
    const coordinator = createInternalStorageCoordinator({
      local,
      session,
      generation: 'generation-1',
    });
    const storage = coordinator.forDefinitionInternal('reports');
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
    const coordinator = createInternalStorageCoordinator({
      local,
      generation: 'stable-generation',
    });
    const storage = coordinator.forDefinitionInternal('reports');
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
    const coordinator = createInternalStorageCoordinator({ local, generation: 'generation-1' });
    const storage = coordinator.forDefinitionInternal('reports');
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
    const firstCoordinator = createInternalStorageCoordinator({
      local,
      session,
      generation: 'reload-stable',
    });
    const firstKey = firstCoordinator
      .forDefinitionInternal('reports')
      .local.subscribeKey('draft', text, { defaultValue: 'empty' });
    firstKey.subscribe(() => {});
    firstKey.set('survives reload');

    const reloadedCoordinator = createInternalStorageCoordinator({
      local,
      session,
      generation: 'reload-stable',
    });
    const reloadedKey = reloadedCoordinator
      .forDefinitionInternal('reports')
      .local.subscribeKey('draft', text, { defaultValue: 'empty' });
    expect(reloadedKey.getSnapshot()).toBe('survives reload');
  });
});
