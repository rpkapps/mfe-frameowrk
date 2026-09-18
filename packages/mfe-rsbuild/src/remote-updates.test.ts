// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { watchRemoteUpdates } from './remote-updates';

it('retains development streams in BFCache and closes them once on final disposal', () => {
  const close = vi.fn();
  class Stream {
    onmessage: ((event: MessageEvent<string>) => void) | null = null;
    close = close;
  }
  vi.stubGlobal('EventSource', Stream);
  try {
    const dispose = watchRemoteUpdates(
      [{ name: 'example', entry: 'https://example.test/manifest.json' }],
      window,
    );
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    expect(close).not.toHaveBeenCalled();
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    expect(close).toHaveBeenCalledTimes(1);
    dispose();
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
