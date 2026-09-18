import { createMemoryHistory } from '@tanstack/history';
import { RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createProbeContext, createProbeRouter, readHistoryMethods } from '../router-probe';

afterEach(cleanup);

// These are executable requirements. Do not invert, skip, or mark expected-failure
// assertions to make the gate green. A changed contract needs an explicit decision.
it('§5.2: the specified native factory adds no global History patch during construction', () => {
  const originalPush = readHistoryMethods().push;
  const originalReplace = readHistoryMethods().replace;
  const router = createProbeRouter({ context: createProbeContext() });
  try {
    expect(readHistoryMethods().push).toBe(originalPush);
    expect(readHistoryMethods().replace).toBe(originalReplace);
  } finally {
    router.history.destroy();
  }
});

it('§5.4.1: a supported native context refresh updates UI without rerunning unrelated loaders', async () => {
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
    expect(loader.mock.calls.length).toBe(before);
  } finally {
    cleanup();
    history.destroy();
    context.queryClient.clear();
  }
});
