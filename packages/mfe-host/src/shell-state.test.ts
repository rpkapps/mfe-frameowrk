import { describe, expect, it, vi } from 'vitest';

import { createShellState } from './shell-state';
import type { ShellState } from '@company/mfe-core';

const initialState: ShellState = {
  user: { id: 'user-1', name: 'Ada' },
  groups: ['readers', 'editors'],
  theme: 'light',
};

describe('shell-state snapshots', () => {
  it('owns immutable copies without freezing or retaining mutable input', () => {
    const input = {
      user: { id: 'user-1', name: 'Ada' },
      groups: ['readers', 'readers'],
      theme: 'light' as const,
    };
    const store = createShellState(input);
    const snapshot = store.getSnapshot();

    input.user.name = 'Changed outside the store';
    input.groups.push('editors');

    expect(store.getSnapshot()).toBe(snapshot);
    expect(snapshot).toEqual({
      user: { id: 'user-1', name: 'Ada' },
      groups: ['readers'],
      theme: 'light',
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.user)).toBe(true);
    expect(Object.isFrozen(snapshot.groups)).toBe(true);
    expect(Object.isFrozen(input.user)).toBe(false);
    expect(Object.isFrozen(input.groups)).toBe(false);
  });

  it('treats equivalent users, reordered groups, and duplicate groups as one no-op', () => {
    const store = createShellState(initialState);
    const snapshot = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    store.subscribeUser(listener);
    store.subscribeGroups(listener);
    store.subscribeTheme(listener);

    const changed = store.update({
      user: { id: 'user-1', name: 'Ada' },
      groups: ['editors', 'readers', 'editors'],
      theme: 'light',
    });

    expect(changed).toBe(false);
    expect(store.getSnapshot()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies only changed fields and preserves unchanged references', () => {
    const store = createShellState(initialState);
    const initial = store.getSnapshot();
    const all = vi.fn();
    const user = vi.fn();
    const groups = vi.fn();
    const theme = vi.fn();
    store.subscribe(all);
    store.subscribeUser(user);
    store.subscribeGroups(groups);
    store.subscribeTheme(theme);

    expect(store.update({ ...initialState, theme: 'dark' })).toBe(true);

    expect(store.getUser()).toBe(initial.user);
    expect(store.getGroups()).toBe(initial.groups);
    expect(store.getTheme()).toBe('dark');
    expect(all).toHaveBeenCalledTimes(1);
    expect(theme).toHaveBeenCalledTimes(1);
    expect(user).not.toHaveBeenCalled();
    expect(groups).not.toHaveBeenCalled();

    store.update({ ...store.getSnapshot(), user: null, groups: ['guests'] });

    expect(store.getUser()).toBeNull();
    expect(store.getGroups()).toEqual(['guests']);
    expect(all).toHaveBeenCalledTimes(2);
    expect(user).toHaveBeenCalledTimes(1);
    expect(groups).toHaveBeenCalledTimes(1);
    expect(theme).toHaveBeenCalledTimes(1);
  });

  it('commits atomically and notifies remaining observers before reporting failures', () => {
    const store = createShellState(initialState);
    const firstError = new Error('adapter observer failed');
    const secondError = new Error('user observer failed');
    const observed: ShellState[] = [];
    const observe = () => observed.push(store.getSnapshot());
    store.subscribe(() => {
      throw firstError;
    });
    store.subscribe(observe);
    store.subscribeUser(() => {
      throw secondError;
    });
    store.subscribeUser(observe);
    store.subscribeGroups(observe);
    store.subscribeTheme(observe);
    const next: ShellState = { user: null, groups: [], theme: 'dark' };

    expect(() => store.update(next)).toThrow(
      new AggregateError([firstError, secondError], 'Shell-state subscription callbacks failed'),
    );

    expect(store.getSnapshot()).toEqual(next);
    expect(observed).toHaveLength(4);
    expect(observed.every((snapshot) => snapshot === store.getSnapshot())).toBe(true);
  });

  it('removes subscriptions and disposes without touching another mount', () => {
    const first = createShellState(initialState);
    const second = createShellState(initialState);
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const unsubscribe = first.subscribeTheme(firstListener);
    unsubscribe();
    unsubscribe();
    first.update({ ...initialState, theme: 'dark' });
    expect(firstListener).not.toHaveBeenCalled();

    first.subscribe(firstListener);
    first.subscribeUser(firstListener);
    first.subscribeGroups(firstListener);
    first.subscribeTheme(firstListener);
    second.subscribeTheme(secondListener);
    const finalSnapshot = first.getSnapshot();
    first.dispose();
    first.dispose();
    first.subscribeTheme(firstListener)();

    expect(first.update(initialState)).toBe(false);
    second.update({ ...initialState, theme: 'dark' });

    expect(first.getSnapshot()).toBe(finalSnapshot);
    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).toHaveBeenCalledTimes(1);
  });
});
