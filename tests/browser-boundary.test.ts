// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlockerFnArgs, RouterHistory } from '@tanstack/history';
import { createShellNavigation } from '../fixtures/test-shell/src/browser-boundary';

let navigation: ReturnType<typeof createShellNavigation>;
let originalHistoryDescriptors: Record<string, PropertyDescriptor>;

beforeEach(() => {
  window.history.replaceState(
    { existing: 'preserved' },
    '',
    '/discovery/project?view=list#decisions',
  );
  originalHistoryDescriptors = Object.getOwnPropertyDescriptors(window.history);
  navigation = createShellNavigation(window);
});

afterEach(() => navigation.dispose());

async function expectPath(path: string) {
  await vi.waitFor(() => {
    expect(navigation.getSnapshot().href).toBe(path);
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      path,
    );
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('test-shell browser boundaries', () => {
  it('starts at deep links and preserves browser state without patching browser methods', () => {
    const history = navigation.createBoundaryHistory('/discovery');
    expect(history.location.href).toBe('/discovery/project?view=list#decisions');
    expect(history.location.state).toMatchObject({ existing: 'preserved', __TSR_index: 0 });
    expect(history.location).toBe(navigation.getSnapshot());
    navigation.dispose();
    expect(Object.getOwnPropertyDescriptors(window.history)).toEqual(originalHistoryDescriptors);
  });

  it('commits remote push and replace synchronously and notifies each subscriber once', () => {
    const history = navigation.createBoundaryHistory('/discovery');
    const remote = vi.fn();
    const shell = vi.fn();
    history.subscribe(remote);
    navigation.subscribe(shell);
    history.push('/discovery/team?member=se#details', { selected: 'se' });
    expect(history.location.href).toBe('/discovery/team?member=se#details');
    expect(window.location.pathname).toBe('/discovery/team');
    expect(remote).toHaveBeenCalledTimes(1);
    expect(shell).toHaveBeenCalledTimes(1);
    const length = window.history.length;
    history.replace('/discovery/team?member=ab', { selected: 'ab' });
    expect(window.history.length).toBe(length);
    expect(history.location.state).toMatchObject({ selected: 'ab', __TSR_index: 1 });
    expect(remote).toHaveBeenLastCalledWith({
      location: history.location,
      action: { type: 'REPLACE' },
    });
    expect(shell).toHaveBeenCalledTimes(2);
  });

  it('rejects paths escaping the remote boundary after URL normalization', async () => {
    const history = navigation.createBoundaryHistory('/discovery');
    for (const path of [
      '/geology',
      '/discovery-other',
      '/discovery/../geology',
      '/discovery/%2e%2e/geology',
      '//outside.example/discovery',
      '/\\outside.example/discovery',
      'https://outside.example/discovery',
      'project',
    ]) {
      expect(() => history.push(path)).toThrow();
      expect(() => history.createHref(path)).toThrow();
    }
    await expect(navigation.navigate('//outside.example')).rejects.toThrow();
    expect(history.location.href).toBe('/discovery/project?view=list#decisions');
    expect(() => navigation.createBoundaryHistory('/')).toThrow();
    expect(() => navigation.createBoundaryHistory('/discovery/')).toThrow();
    expect(() => navigation.createBoundaryHistory('/geology')).toThrow();
  });

  it('changes apps through the shell while keeping retired remote histories isolated', async () => {
    const discovery = navigation.createBoundaryHistory('/discovery');
    const listener = vi.fn();
    discovery.subscribe(listener);
    await navigation.navigate('/geology/map?layer=depth#west');
    const geology = navigation.createBoundaryHistory('/geology');
    expect(geology).not.toBe(discovery);
    expect(geology.location.href).toBe('/geology/map?layer=depth#west');
    expect(discovery.location.href).toBe('/discovery/project?view=list#decisions');
    expect(listener).not.toHaveBeenCalled();
    discovery.push('/discovery/stale');
    expect(navigation.getSnapshot().pathname).toBe('/geology/map');
    discovery.destroy();
    discovery.push('/discovery/disposed');
    expect(discovery.subscribers.size).toBe(0);
    expect(navigation.getSnapshot().pathname).toBe('/geology/map');
  });

  it('handles browser back and forward with full URLs and native history actions', async () => {
    const history = navigation.createBoundaryHistory('/discovery');
    const listener = vi.fn();
    history.subscribe(listener);
    history.push('/discovery/team?view=people#lead');
    history.push('/discovery/framing');
    history.back();
    await expectPath('/discovery/team?view=people#lead');
    expect(listener).toHaveBeenLastCalledWith({
      location: history.location,
      action: { type: 'BACK' },
    });
    history.forward();
    await expectPath('/discovery/framing');
    expect(listener).toHaveBeenLastCalledWith({
      location: history.location,
      action: { type: 'FORWARD' },
    });
    history.go(-2);
    await expectPath('/discovery/project?view=list#decisions');
    expect(listener).toHaveBeenLastCalledWith({
      location: history.location,
      action: { type: 'GO', index: -2 },
    });
  });

  it('keeps the app mounted during shell exits and commits one native proceed decision', async () => {
    const history = navigation.createBoundaryHistory('/discovery');
    const decision = deferred<boolean>();
    const blocker = vi.fn<(args: BlockerFnArgs) => Promise<boolean>>(() => decision.promise);
    history.block({ blockerFn: blocker });
    const result = navigation.navigate('/geology/map');
    expect(navigation.getSnapshot().pathname).toBe('/discovery/project');
    expect(window.location.pathname).toBe('/discovery/project');
    expect(blocker.mock.calls[0]?.[0].currentLocation).toBe(history.location);
    expect(blocker.mock.calls[0]?.[0].nextLocation.pathname).toBe('/geology/map');
    expect(blocker.mock.calls[0]?.[0].action).toBe('PUSH');
    expect(await navigation.navigate('/geology/another')).toBe(false);
    expect(blocker).toHaveBeenCalledTimes(1);
    decision.resolve(false);
    expect(await result).toBe(true);
    await expectPath('/geology/map');
  });

  it('honors a native reset decision without changing browser history', async () => {
    const history = navigation.createBoundaryHistory('/discovery');
    const unsubscribe = history.block({ blockerFn: () => true });
    expect(await navigation.navigate('/geology')).toBe(false);
    expect(navigation.getSnapshot().pathname).toBe('/discovery/project');
    expect(window.location.pathname).toBe('/discovery/project');
    unsubscribe();
    expect(await navigation.navigate('/geology')).toBe(true);
  });

  it('restores canceled browser Back and retains the remote without notifications', async () => {
    const history = navigation.createBoundaryHistory('/discovery');
    history.push('/discovery/team');
    const listener = vi.fn();
    history.subscribe(listener);
    const blocker = vi.fn<(args: BlockerFnArgs) => boolean>(() => true);
    const unblock = history.block({ blockerFn: blocker });
    window.history.back();
    await vi.waitFor(() => expect(blocker).toHaveBeenCalledTimes(1));
    await expectPath('/discovery/team');
    expect(listener).not.toHaveBeenCalled();
    expect(blocker.mock.calls[0]?.[0]).toMatchObject({
      action: 'BACK',
      currentLocation: { pathname: '/discovery/team' },
      nextLocation: { pathname: '/discovery/project' },
    });
    unblock();
    window.history.back();
    await expectPath('/discovery/project?view=list#decisions');
  });

  it('passes cross-app browser Back to the active remote blocker before committing', async () => {
    await navigation.navigate('/geology/map');
    const history = navigation.createBoundaryHistory('/geology');
    const decision = deferred<boolean>();
    const blocker = vi.fn<(args: BlockerFnArgs) => Promise<boolean>>(() => decision.promise);
    history.block({ blockerFn: blocker });
    window.history.back();
    await vi.waitFor(() => expect(blocker).toHaveBeenCalledTimes(1));
    expect(navigation.getSnapshot().pathname).toBe('/geology/map');
    expect(history.location.pathname).toBe('/geology/map');
    decision.resolve(false);
    await expectPath('/discovery/project?view=list#decisions');
    expect(history.location.pathname).toBe('/geology/map');
  });

  it('owns beforeunload listeners and removes retired boundary blockers', () => {
    const history = navigation.createBoundaryHistory('/discovery');
    history.block({ blockerFn: () => true, enableBeforeUnload: false });
    const event = () => new Event('beforeunload', { cancelable: true });
    const allowed = event();
    window.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);
    history.block({ blockerFn: () => true, enableBeforeUnload: () => true });
    const blocked = event();
    window.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);
    history.destroy();
    const afterDestroy = event();
    window.dispatchEvent(afterDestroy);
    expect(afterDestroy.defaultPrevented).toBe(false);
    navigation.dispose();
    expect(() => navigation.createBoundaryHistory('/discovery')).toThrow(/disposed/);
  });

  it('settles pending blocker decisions when the shell is disposed', async () => {
    const history = navigation.createBoundaryHistory('/discovery');
    history.block({ blockerFn: () => new Promise<boolean>(() => {}) });
    const result = navigation.navigate('/geology');
    navigation.dispose();
    expect(await result).toBe(false);
    expect(window.location.pathname).toBe('/discovery/project');
  });

  it('settles a pending shell exit when its owning app attempt is retired', async () => {
    const history = navigation.createBoundaryHistory('/discovery');
    history.block({ blockerFn: () => new Promise<boolean>(() => {}) });
    const result = navigation.navigate('/geology');
    history.destroy();
    expect(await result).toBe(false);
    expect(window.location.pathname).toBe('/discovery/project');
    expect(await navigation.navigate('/geology')).toBe(true);
  });

  it('does not retain a blocker bypass after a no-op traversal', async () => {
    const history = navigation.createBoundaryHistory('/discovery');
    history.forward({ ignoreBlocker: true });
    history.back({ ignoreBlocker: true });
    const blocker = vi.fn(() => true);
    history.block({ blockerFn: blocker });
    expect(await navigation.navigate('/geology')).toBe(false);
    expect(blocker).toHaveBeenCalledTimes(1);
  });

  it('does not commit a remote decision after that attempt history is destroyed', async () => {
    const history: RouterHistory = navigation.createBoundaryHistory('/discovery');
    const decision = deferred<boolean>();
    history.block({ blockerFn: () => decision.promise });
    history.push('/discovery/team');
    history.destroy();
    decision.resolve(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(window.location.pathname).toBe('/discovery/project');
  });
});
