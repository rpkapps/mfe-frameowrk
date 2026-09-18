import type { RemoteLocation } from './runtime';

/** Development fallback: preserve URL and persisted shell state through a page reload. */
export function watchRemoteUpdates(
  remotes: readonly RemoteLocation[],
  win: Window & typeof globalThis,
): () => void {
  const streams: EventSource[] = [];
  let disposed = false;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const events of streams) events.close();
    win.removeEventListener('pagehide', pagehide);
  }
  function pagehide(event: PageTransitionEvent): void {
    if (!event.persisted) dispose();
  }
  try {
    for (const remote of remotes) {
      const events = new win.EventSource(new URL('/__mfe_events', remote.entry));
      streams.push(events);
      let previous: string | undefined;
      events.onmessage = (event: MessageEvent<string>) => {
        if (disposed) return;
        if (previous && previous !== event.data) win.location.reload();
        previous = event.data;
      };
    }
    win.addEventListener('pagehide', pagehide);
  } catch (cause) {
    dispose();
    throw cause;
  }
  return dispose;
}
