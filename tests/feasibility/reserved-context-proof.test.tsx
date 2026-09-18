// @vitest-environment jsdom
import { createMemoryHistory } from '@tanstack/history';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ProbeContext {
  readonly mfe: Readonly<{ theme: string }>;
  readonly author: string;
}

function createProbe() {
  const initial = Object.freeze({ theme: 'light' });
  const permittedSnapshots = new WeakSet<object>([initial]);
  const context: ProbeContext = { mfe: initial, author: 'preserved' };
  const featureRender = vi.fn();
  const loader = vi.fn<(mfe: ProbeContext['mfe']) => void>();
  const report = vi.fn<(routeId: string) => void>();
  const authorWrap = vi.fn();
  const events: string[] = [];
  let failure: string | undefined;
  let retirementScheduled = false;
  let retire = () => {};
  function AuthorWrap({ children }: PropsWithChildren) {
    authorWrap();
    return <div data-testid="author-wrap">{children}</div>;
  }
  function Feature() {
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    featureRender(pathname);
    return <h1>Feature</h1>;
  }
  const root = createRootRouteWithContext<ProbeContext>()({ component: Outlet });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: Feature });
  const conflict = createRoute({
    getParentRoute: () => root,
    path: '/conflict',
    beforeLoad: async () => {
      await Promise.resolve();
      return { mfe: { theme: 'invalid' } };
    },
    loader: ({ context: next }) => loader(next.mfe),
    component: Feature,
  });
  const forward = createRoute({
    getParentRoute: () => root,
    path: '/forward',
    beforeLoad: ({ context: next }) => ({ mfe: next.mfe }),
    component: Feature,
  });
  const history = createMemoryHistory({ initialEntries: ['/'] });
  const router = createRouter({
    routeTree: root.addChildren([index, conflict, forward]),
    context,
    history,
    InnerWrap: AuthorWrap,
    defaultPendingMinMs: 0,
  });

  function findConflict(matches: readonly { routeId: string; context: unknown }[]) {
    for (const match of matches) {
      const matchContext = match.context as ProbeContext;
      if (!permittedSnapshots.has(matchContext.mfe)) return match.routeId;
    }
    return undefined;
  }

  // Observation only: route tree, author components, native navigation,
  // stores, and data callbacks retain their original behavior.
  router.subscribe('onLoad', () => {
    events.push('load');
    failure ??= findConflict(router.state.matches);
  });
  router.subscribe('onRendered', () => {
    events.push('rendered');
    if (failure && !retirementScheduled) {
      retirementScheduled = true;
      const routeId = failure;
      queueMicrotask(() => {
        if (router.state.status !== 'idle' || router.state.isLoading) {
          retirementScheduled = false;
          return;
        }
        events.push('retire');
        report(routeId);
        retire();
      });
    }
  });

  return {
    router,
    initial,
    featureRender,
    loader,
    report,
    authorWrap,
    events,
    findConflict,
    async mount() {
      await act(async () => {
        await router.load();
      });
      const view = render(<RouterProvider router={router} />);
      retire = () => view.unmount();
      await screen.findByRole('heading');
      return view;
    },
    updateSnapshot() {
      const mfe = Object.freeze({ theme: 'dark' });
      permittedSnapshots.add(mfe);
      router.update({ context: { ...router.options.context, mfe } });
      return mfe;
    },
  };
}

afterEach(() => cleanup());
beforeEach(() => vi.spyOn(window, 'scrollTo').mockImplementation(() => {}));

describe('supported reserved-context presentation lifecycle proof', () => {
  it('retires after native rendering acknowledgement without stranding navigation', async () => {
    const probe = createProbe();
    await probe.mount();
    const initialRenders = probe.featureRender.mock.calls.length;
    let settled = false;
    let navigation: Promise<void> | undefined;
    await act(async () => {
      navigation = probe.router.navigate({ to: '/conflict' }).then(() => {
        settled = true;
        probe.events.push('navigation continuation');
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(settled).toBe(true));
    await navigation;
    expect(probe.report).toHaveBeenCalledExactlyOnceWith('/conflict');
    expect(probe.featureRender.mock.calls.length).toBeGreaterThan(initialRenders);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(probe.authorWrap).toHaveBeenCalled();
    // Diagnosis does not imply preventing author render or data callbacks.
    expect(probe.loader).toHaveBeenCalledWith({ theme: 'invalid' });
    expect(probe.events.slice(-4)).toEqual([
      'load',
      'rendered',
      'retire',
      'navigation continuation',
    ]);
  });

  it('accepts retained legitimate snapshots and exact forwarding after an update', async () => {
    const probe = createProbe();
    await probe.mount();
    const next = probe.updateSnapshot();
    expect(probe.findConflict(probe.router.state.matches)).toBeUndefined();
    let navigation: Promise<void> | undefined;
    await act(async () => {
      navigation = probe.router.navigate({ to: '/forward' });
      await Promise.resolve();
    });
    await waitFor(() => expect(probe.router.state.location.pathname).toBe('/forward'));
    await navigation;
    const currentContext = probe.router.state.matches.at(-1)?.context as ProbeContext;
    expect(currentContext.mfe).toBe(next);
    expect(probe.report).not.toHaveBeenCalled();
    expect(probe.router.options.context.author).toBe('preserved');
    expect(screen.getByTestId('author-wrap').contains(screen.getByRole('heading'))).toBe(true);
  });

  it('shows preloaded merged contexts are inspectable but do not emit load/rendered events', async () => {
    const probe = createProbe();
    await probe.mount();
    const eventCount = probe.events.length;
    const matches = await probe.router.preloadRoute({ to: '/conflict' });
    expect(probe.findConflict(matches ?? [])).toBe('/conflict');
    expect(probe.events).toHaveLength(eventCount);
    expect(probe.report).not.toHaveBeenCalled();
  });

  it('retains the conflict when a subsequent navigation supersedes its presentation', async () => {
    const probe = createProbe();
    await probe.mount();
    let replacement: Promise<void> | undefined;
    const unsubscribe = probe.router.subscribe('onLoad', ({ toLocation }) => {
      if (toLocation.pathname === '/conflict') {
        replacement = probe.router.navigate({ to: '/forward' });
      }
    });
    let original: Promise<void> | undefined;
    let settled = false;
    await act(async () => {
      original = probe.router.navigate({ to: '/conflict' }).then(() => {
        settled = true;
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(settled).toBe(true));
    await Promise.all([original, replacement]);
    expect(probe.report).toHaveBeenCalledExactlyOnceWith('/conflict');
    expect(screen.queryByRole('heading')).toBeNull();
    unsubscribe();
  });

  it('waits for navigation started by another final-render subscriber before retiring', async () => {
    const probe = createProbe();
    await probe.mount();
    let replacement: Promise<void> | undefined;
    let replacementSettled = false;
    const unsubscribe = probe.router.subscribe('onRendered', ({ toLocation }) => {
      if (toLocation.pathname === '/conflict') {
        replacement = probe.router.navigate({ to: '/forward' }).then(() => {
          replacementSettled = true;
        });
      }
    });
    let original: Promise<void> | undefined;
    await act(async () => {
      original = probe.router.navigate({ to: '/conflict' });
      await Promise.resolve();
    });
    await waitFor(() => expect(probe.report).toHaveBeenCalledOnce());
    await Promise.all([original, replacement]);
    expect(replacement).toBeDefined();
    expect(replacementSettled).toBe(true);
    expect(original).toBeDefined();
    unsubscribe();
  });
});
