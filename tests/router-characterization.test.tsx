// @vitest-environment jsdom
import { createMemoryHistory } from '@tanstack/history';
import { RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProbeContext, createProbeRouter, readHistoryMethods } from './router-probe';

afterEach(cleanup);

describe('Gate 0: pinned native behavior, not contract acceptance', () => {
  it('distinguishes default history from explicitly supplied history through options', () => {
    const originalPush = readHistoryMethods().push;
    const originalReplace = readHistoryMethods().replace;
    const router = createProbeRouter({ context: createProbeContext() });
    try {
      expect(router.options.history).toBeUndefined();
      expect(router.history).toBeDefined();
      expect(readHistoryMethods().push).not.toBe(originalPush);
      expect(readHistoryMethods().replace).not.toBe(originalReplace);
    } finally {
      router.history.destroy();
    }
    expect(readHistoryMethods().push).toBe(originalPush);
    expect(readHistoryMethods().replace).toBe(originalReplace);
  });

  it('avoids creating browser history when a framework history is supplied before construction', () => {
    const originalPush = readHistoryMethods().push;
    const originalReplace = readHistoryMethods().replace;
    const history = createMemoryHistory({ initialEntries: ['/tracer/'] });
    const router = createProbeRouter({ context: createProbeContext(), history });
    try {
      expect(router.options.history).toBe(history);
      expect(router.history).toBe(history);
      expect(readHistoryMethods().push).toBe(originalPush);
      expect(readHistoryMethods().replace).toBe(originalReplace);
    } finally {
      history.destroy();
    }
  });

  it('shows that out-of-order default-history destruction restores an obsolete wrapper', () => {
    const originalPush = readHistoryMethods().push;
    const first = createProbeRouter({ context: createProbeContext() });
    const firstWrapper = readHistoryMethods().push;
    const second = createProbeRouter({ context: createProbeContext() });
    try {
      first.history.destroy();
      expect(readHistoryMethods().push).toBe(originalPush);
      second.history.destroy();
      expect(readHistoryMethods().push).toBe(firstWrapper);
    } finally {
      // Reverse-order cleanup restores the test document even when an assertion fails.
      second.history.destroy();
      first.history.destroy();
    }
    expect(readHistoryMethods().push).toBe(originalPush);
  });

  it('does not refresh native route-context consumers with update({ context }) alone', async () => {
    const context = createProbeContext();
    const history = createMemoryHistory({ initialEntries: ['/tracer/'] });
    const router = createProbeRouter({ context, history });
    try {
      await router.load();
      render(<RouterProvider router={router} />);
      expect((await screen.findByTestId('theme')).textContent).toBe('light');
      act(() => router.update({ context: { ...context, mfe: { ...context.mfe, theme: 'dark' } } }));
      expect(screen.getByTestId('theme').textContent).toBe('light');
      expect(router.options.context.mfe.theme).toBe('dark');
      expect(router.state.matches[0]).toMatchObject({ context: { mfe: { theme: 'light' } } });
    } finally {
      cleanup();
      history.destroy();
      context.queryClient.clear();
    }
  });

  it('refreshes native context through invalidate, but also reruns a default-stale loader', async () => {
    const loader = vi.fn(() => Promise.resolve('loaded'));
    const context = createProbeContext();
    const history = createMemoryHistory({ initialEntries: ['/tracer/'] });
    const router = createProbeRouter({ context, history, loader });
    try {
      await router.load();
      render(<RouterProvider router={router} />);
      await screen.findByTestId('theme');
      const before = loader.mock.calls.length;
      await act(async () => {
        router.update({ context: { ...context, mfe: { ...context.mfe, theme: 'dark' } } });
        await router.invalidate({ filter: () => false });
      });
      expect(screen.getByTestId('theme').textContent).toBe('dark');
      expect(loader.mock.calls.length).toBeGreaterThan(before);
    } finally {
      cleanup();
      history.destroy();
      context.queryClient.clear();
    }
  });
});
