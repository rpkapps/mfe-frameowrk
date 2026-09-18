import type {
  BoundaryHistory,
  BoundaryLocation,
  BoundaryState,
  HistoryAction,
  HistoryNotification,
  NavigateOptions,
  NavigationBlocker,
} from './boundary-history';

interface Boundary {
  readonly basePath: string;
  readonly history: BoundaryHistory;
  readonly blockers: Set<NavigationBlocker>;
  readonly retired: Promise<true>;
  readonly retire: () => void;
  location: BoundaryLocation;
  disposed: boolean;
}

/**
 * Framework-neutral browser ownership. Routers see full browser paths, but may only
 * push and replace within their base path. App changes go through navigate().
 * No browser methods are replaced, and each attempt receives a fresh history.
 */
export function createBrowserNavigation(win: Window): BrowserNavigation {
  const listeners = new Set<() => void>();
  const boundaries = new Set<Boundary>();
  let disposed = false;
  let transitionPending = false;
  let popGeneration = 0;
  let ignorePop = false;
  let traversalOptions: (NavigateOptions & { readonly index: number }) | undefined;
  let finishRestore: (() => void) | undefined;
  let restoring: Promise<void> | undefined;
  const getRestore = () => restoring;
  let cancelDecisions = () => {};
  const retired = new Promise<true>((resolve) => {
    cancelDecisions = () => resolve(true);
  });

  function browserLocation(): BoundaryLocation {
    const state = win.history.state as BoundaryState | null;
    return parseHref(
      `${win.location.pathname}${win.location.search}${win.location.hash}`,
      state ?? stateAt(0),
    );
  }

  function stateAt(index: number, state?: object): BoundaryState {
    const key = win.crypto.randomUUID();
    return { ...state, key, index: index };
  }

  // Seed only the current entry. Preserve unrelated state owned by the host.
  const initialState = win.history.state as BoundaryState | null;
  if (!Number.isInteger(initialState?.index)) {
    win.history.replaceState(stateAt(0, initialState ?? {}), '', win.location.href);
  }
  let location = browserLocation();

  const contains = (basePath: string, pathname: string) =>
    pathname === basePath || pathname.startsWith(`${basePath}/`);

  function pathFor(path: string, basePath?: string): string {
    // URL parsing resolves dot segments and encoded dots before prefix checks.
    // Relative, protocol-relative, and external links are outside this bridge.
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
      throw new Error('Shell navigation requires an absolute same-origin path.');
    }
    const url = new URL(path, win.location.origin);
    if (url.origin !== win.location.origin || (basePath && !contains(basePath, url.pathname))) {
      throw new Error(`The path ${path} is outside the ${basePath ?? 'shell'} boundary.`);
    }
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function activeBlockers() {
    return [...boundaries]
      .filter((boundary) => !boundary.disposed && contains(boundary.basePath, location.pathname))
      .sort((left, right) => right.basePath.length - left.basePath.length)
      .flatMap((boundary) => [...boundary.blockers].map((blocker) => ({ blocker, boundary })));
  }

  function commit(next: BoundaryLocation, action: HistoryNotification) {
    location = next;
    for (const boundary of boundaries) {
      if (contains(boundary.basePath, next.pathname)) {
        boundary.location = next;
        boundary.history.notify(action);
      }
    }
    for (const listener of listeners) listener();
  }

  function isBlocked(
    next: BoundaryLocation,
    action: HistoryAction,
    ignoreBlocker = false,
  ): boolean | Promise<boolean> {
    if (ignoreBlocker) return false;
    const blockers = activeBlockers();
    if (!blockers.length) return false;
    return (async () => {
      for (const { blocker, boundary } of blockers) {
        if (
          await Promise.race([
            blocker.blockerFn({ currentLocation: location, nextLocation: next, action }),
            retired,
            boundary.retired,
          ])
        )
          return true;
        if (disposed) return true;
      }
      return false;
    })();
  }

  function restoreCursor(delta: number) {
    if (!delta || restoring) return;
    ignorePop = true;
    restoring = new Promise<void>((resolve) => {
      finishRestore = resolve;
    });
    win.history.go(-delta);
  }

  async function navigate(
    path: string,
    options: {
      readonly replace?: boolean;
      readonly state?: object;
      readonly ignoreBlocker?: boolean;
    } = {},
    owner?: Boundary,
  ): Promise<boolean> {
    const href = pathFor(path);
    // A native useBlocker resolver represents one pending decision. Repeated
    // clicks must not replace it or replay a stale decision after it resolves.
    if (disposed || transitionPending || restoring) return false;
    const action = options.replace ? 'REPLACE' : 'PUSH';
    const state = stateAt(location.state.index + (options.replace ? 0 : 1), options.state);
    const next = parseHref(href, state);
    transitionPending = true;
    try {
      const blocked = isBlocked(next, action, options.ignoreBlocker);
      if (typeof blocked === 'boolean' ? blocked : await blocked) return false;
      // A user can press Back while an unsaved-changes decision is open.
      // That traversal is restored before accepting the original decision.
      const restore = getRestore();
      if (restore) await restore;
      if (disposed || owner?.disposed) return false;
      traversalOptions = undefined;
      if (options.replace) win.history.replaceState(state, '', href);
      else win.history.pushState(state, '', href);
      commit(next, { type: action });
      return true;
    } finally {
      transitionPending = false;
    }
  }

  async function onPopState() {
    if (disposed) return;
    if (ignorePop) {
      ignorePop = false;
      finishRestore?.();
      finishRestore = undefined;
      restoring = undefined;
      return;
    }
    const next = browserLocation();
    const generation = ++popGeneration;
    const delta = next.state.index - location.state.index;
    const action = delta === -1 ? 'BACK' : delta === 1 ? 'FORWARD' : 'GO';
    const options = traversalOptions?.index === next.state.index ? traversalOptions : undefined;
    traversalOptions = undefined;
    // Keep the existing app alive throughout the native resolver's decision.
    // A canceled pop restores the browser cursor without notifying the router.
    if (transitionPending) {
      restoreCursor(delta);
      return;
    }
    transitionPending = true;
    try {
      const blocked = isBlocked(next, action, options?.ignoreBlocker);
      const canceled = typeof blocked === 'boolean' ? blocked : await blocked;
      if (disposed || generation !== popGeneration) return;
      if (canceled) {
        restoreCursor(delta);
        return;
      }
      if (!disposed) {
        commit(next, action === 'GO' ? { type: action, index: delta } : { type: action });
      }
    } catch (error) {
      if (!disposed) restoreCursor(delta);
      throw error;
    } finally {
      transitionPending = false;
    }
  }

  function handlePopState() {
    void onPopState().catch((error: unknown) => win.reportError(error));
  }

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (
      activeBlockers().some(({ blocker }) => {
        const enabled = blocker.enableBeforeUnload ?? true;
        return typeof enabled === 'function' ? enabled() : enabled;
      })
    ) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  function createBoundaryHistory(basePath: string): BoundaryHistory {
    if (disposed) throw new Error('The browser navigation has been disposed.');
    if (basePath === '/' || basePath.endsWith('/') || pathFor(basePath) !== basePath) {
      throw new Error('An app boundary requires a normalized non-root base path.');
    }
    if (!contains(basePath, location.pathname)) {
      throw new Error(`Navigate to ${basePath} before creating its boundary history.`);
    }
    const subscribers: BoundaryHistory['subscribers'] = new Set();
    const blockers = new Set<NavigationBlocker>();
    let retire = () => {};
    const boundaryRetired = new Promise<true>((resolve) => {
      retire = () => resolve(true);
    });
    const traverse = (delta: number, options?: NavigateOptions) => {
      if (
        boundary.disposed ||
        disposed ||
        transitionPending ||
        restoring ||
        !contains(basePath, location.pathname) ||
        delta === 0
      )
        return;
      // Avoid leaving a stale bypass after a no-op back at our first entry.
      const nextIndex = location.state.index + delta;
      if (nextIndex < 0) return;
      traversalOptions = { ...options, index: nextIndex };
      win.history.go(delta);
    };
    const move = (path: string, replace: boolean, state?: object, options?: NavigateOptions) => {
      if (boundary.disposed || disposed || !contains(basePath, location.pathname)) return;
      const href = pathFor(path, basePath);
      void navigate(href, { replace, ...(state && { state }), ...options }, boundary).catch(
        (error: unknown) => win.reportError(error),
      );
    };
    const history: BoundaryHistory = {
      get location() {
        return boundary.location;
      },
      get length() {
        return win.history.length;
      },
      subscribers,
      subscribe(listener) {
        if (!boundary.disposed) subscribers.add(listener);
        return () => subscribers.delete(listener);
      },
      push: (path, state: object | undefined, options) => move(path, false, state, options),
      replace: (path, state: object | undefined, options) => move(path, true, state, options),
      go: traverse,
      back: (options) => traverse(-1, options),
      forward: (options) => traverse(1, options),
      canGoBack: () => location.state.index > 0,
      createHref: (href) => pathFor(href, basePath),
      block(blocker) {
        if (!boundary.disposed) blockers.add(blocker);
        return () => blockers.delete(blocker);
      },
      flush() {},
      destroy() {
        boundary.disposed = true;
        boundary.retire();
        subscribers.clear();
        blockers.clear();
        boundaries.delete(boundary);
      },
      notify(action) {
        if (!boundary.disposed) {
          for (const listener of subscribers) listener({ location: boundary.location, action });
        }
      },
      getBlockers: () => [...blockers],
    };
    const boundary: Boundary = {
      basePath,
      history,
      blockers,
      retired: boundaryRetired,
      retire,
      location,
      disposed: false,
    };
    boundaries.add(boundary);
    return history;
  }

  win.addEventListener('popstate', handlePopState);
  win.addEventListener('beforeunload', onBeforeUnload);

  return {
    getSnapshot: () => location,
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => listeners.delete(listener);
    },
    navigate: (path: string, options?: Parameters<typeof navigate>[1]) => navigate(path, options),
    createBoundaryHistory,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelDecisions();
      finishRestore?.();
      win.removeEventListener('popstate', handlePopState);
      win.removeEventListener('beforeunload', onBeforeUnload);
      for (const boundary of boundaries) boundary.history.destroy();
      listeners.clear();
    },
  };
}

export interface BrowserNavigation {
  readonly getSnapshot: () => BoundaryLocation;
  readonly subscribe: (listener: () => void) => () => void;
  readonly navigate: (
    path: string,
    options?: {
      readonly replace?: boolean;
      readonly state?: object;
      readonly ignoreBlocker?: boolean;
    },
  ) => Promise<boolean>;
  readonly createBoundaryHistory: (basePath: string) => BoundaryHistory;
  readonly dispose: () => void;
}

function parseHref(href: string, state: BoundaryState): BoundaryLocation {
  const url = new URL(href, 'https://boundary.invalid');
  return {
    href: `${url.pathname}${url.search}${url.hash}`,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    state,
  };
}
