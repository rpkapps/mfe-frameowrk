import type { HistoryLocation, NavigationBlocker, RouterHistory } from '@tanstack/history';
import type { BoundaryHistory, BoundaryLocation } from '@company/mfe-host';

/** Translate the shared boundary into the native history supplied to createRouter. */
export function createNavigationHistory(boundary: BoundaryHistory): RouterHistory {
  const locations = new WeakMap<BoundaryLocation, HistoryLocation>();
  const subscribers: RouterHistory['subscribers'] = new Set();
  const blockers = new Set<NavigationBlocker>();
  let disposed = false;

  function nativeLocation(location: BoundaryLocation): HistoryLocation {
    const cached = locations.get(location);
    if (cached) return cached;
    const result = {
      ...location,
      state: {
        ...location.state,
        __TSR_key: location.state.key,
        __TSR_index: location.state.index,
      },
    };
    locations.set(location, result);
    return result;
  }

  // Router-owned fields never become host-owned browser state. The bridge adds
  // them back from the neutral entry identity when presenting native locations.
  function neutralState(state: unknown): object | undefined {
    if (state === null || typeof state !== 'object') return undefined;
    const result = { ...state } as Record<string, unknown>;
    delete result.__TSR_key;
    delete result.__TSR_index;
    return result;
  }

  const unsubscribe = boundary.subscribe(({ location, action }) => {
    for (const listener of subscribers) listener({ location: nativeLocation(location), action });
  });

  return {
    get location() {
      return nativeLocation(boundary.location);
    },
    get length() {
      return boundary.length;
    },
    subscribers,
    subscribe(listener) {
      if (!disposed) subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    push: (path, state: unknown, options) => boundary.push(path, neutralState(state), options),
    replace: (path, state: unknown, options) =>
      boundary.replace(path, neutralState(state), options),
    go: (delta, options) => boundary.go(delta, options),
    back: (options) => boundary.back(options),
    forward: (options) => boundary.forward(options),
    canGoBack: () => boundary.canGoBack(),
    createHref: (href) => boundary.createHref(href),
    block(blocker) {
      if (disposed) return () => {};
      blockers.add(blocker);
      const unblock = boundary.block({
        ...(blocker.enableBeforeUnload !== undefined && {
          enableBeforeUnload: blocker.enableBeforeUnload,
        }),
        blockerFn: async ({ currentLocation, nextLocation, action }) =>
          Boolean(
            await blocker.blockerFn({
              currentLocation: nativeLocation(currentLocation),
              nextLocation: nativeLocation(nextLocation),
              action,
            }),
          ),
      });
      return () => {
        blockers.delete(blocker);
        unblock();
      };
    },
    flush: () => boundary.flush(),
    notify: (action) => boundary.notify(action),
    _getBlockers: () => [...blockers],
    destroy() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      subscribers.clear();
      blockers.clear();
      boundary.destroy();
    },
  };
}
