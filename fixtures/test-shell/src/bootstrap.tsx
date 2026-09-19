import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createAppRuntime,
  createBrowserNavigation,
  createShellSession,
  createShellState,
} from '@company/mfe-host';
import { createInternalStorageCoordinator } from '@company/mfe-host/internal';
import type { AppRuntime } from '@company/mfe-host';
import { AppHost } from '@company/mfe-react';
import { createReactAdapter, MfeHostProvider } from '@company/mfe-react/internal';
import type { MfeHostEnvironment } from '@company/mfe-react/internal';
import { watchRemoteUpdates } from '@company/mfe-rsbuild/runtime';
import { Button } from '@tecton/react/components/button';
import { registry, overrideWarnings, remotes } from './registry';
import { TestShell, AppFailure } from './shell';
import { createWidgetScalingRuntime, WidgetScalingGrid } from './widget-storage-scaling';
import { scalingWidgetIds } from './widget-storage-scaling';
import './global.css';

const navigation = createBrowserNavigation(window);
const user = { id: 'test-engineer', name: 'Sarah Elliott' };
const groups = ['test-engineers'];
const shellState = createShellState({ user, groups, theme: 'dark' });
const storage = createInternalStorageCoordinator({
  local: window.localStorage,
  session: window.sessionStorage,
  generation: 'test-shell-generation',
  knownDefinitionIds: ['discovery', 'geology', ...scalingWidgetIds],
});
let generationCounter = 0;
const createGeneration = () => `test-shell-generation:${++generationCounter}`;
const session = createShellSession({
  coordinator: storage,
  createGeneration,
  initial: shellState.getSnapshot(),
  store: shellState,
});
const widgetFixture = createWidgetScalingRuntime(shellState, storage, session);
const widgetRuntime = widgetFixture.runtime;
const hostEnvironment: MfeHostEnvironment = {
  get runtime() {
    return runtime;
  },
  shellState,
  createNavigation: (basePath) => navigation.createBoundaryHistory(basePath),
  widgetRuntime,
  session,
};
const runtime: AppRuntime = createAppRuntime({
  registry,
  adapters: [createReactAdapter(hostEnvironment)],
  reportError() {},
  storage: {
    coordinator: storage,
    createGeneration,
    session,
  },
});
const themeKey = 'mfe.test-shell.theme';

function readTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem(themeKey) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function DualDiscovery() {
  const [firstVisible, setFirstVisible] = useState(true);
  return (
    <div data-testid="dual-discovery" className="grid min-h-0 flex-1 gap-3 p-3 md:grid-cols-2">
      <div data-testid="dual-first" className="flex min-h-0 min-w-0 flex-col rounded border">
        <div className="flex items-center gap-2 border-b p-2">
          <strong>First Discovery mount</strong>
          {firstVisible && (
            <Button variant="outline" onPress={() => setFirstVisible(false)}>
              Dispose first mount
            </Button>
          )}
        </div>
        {firstVisible && (
          <AppHost appId="discovery" basePath="/discovery" className="min-h-0 w-full flex-1" />
        )}
      </div>
      <div data-testid="dual-second" className="flex min-h-0 min-w-0 flex-col rounded border">
        <div className="flex items-center gap-2 border-b p-2">
          <strong>Second Discovery mount</strong>
          <Button
            variant="outline"
            onPress={() => {
              navigation
                .navigate('/discovery/')
                .catch((cause: unknown) => window.reportError(cause));
            }}
          >
            Exit nested boundary
          </Button>
        </div>
        <AppHost
          appId="discovery"
          basePath="/discovery/project"
          className="min-h-0 w-full flex-1"
        />
      </div>
    </div>
  );
}

function ShellApplication() {
  const location = useSyncExternalStore(
    (listener) => navigation.subscribe(listener),
    () => navigation.getSnapshot(),
  );
  const appId = location.pathname.startsWith('/geology') ? 'geology' : 'discovery';
  const scaleRoute =
    location.pathname.startsWith('/discovery/project') &&
    new URLSearchParams(location.search).get('dual') === '1' &&
    new URLSearchParams(location.search).get('fixture') === 'widget-storage-scaling';
  const [theme, setTheme] = useState(readTheme);
  const dualDiscovery =
    appId === 'discovery' &&
    location.pathname.startsWith('/discovery/project') &&
    new URLSearchParams(location.search).get('dual') === '1';
  useEffect(() => {
    session.update({ user, groups, theme });
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(themeKey, theme);
    } catch {
      /* Storage is optional. */
    }
  }, [theme]);

  return (
    <TestShell
      appId={appId}
      onAppChange={(next) => {
        navigation.navigate(`/${next}/`).catch((cause: unknown) => window.reportError(cause));
      }}
      theme={theme}
      onThemeChange={setTheme}
    >
      {overrideWarnings.length > 0 && (
        <div role="status" className="bg-muted px-4 py-2 text-sm">
          {overrideWarnings.join(' ')}
        </div>
      )}
      {scaleRoute ? (
        <div className="grid min-h-0 flex-1 gap-3 p-3">
          <DualDiscovery />
          <Suspense fallback={<div role="status">Loading scale Widgets…</div>}>
            <WidgetScalingGrid />
          </Suspense>
        </div>
      ) : dualDiscovery ? (
        <DualDiscovery />
      ) : (
        <Suspense
          fallback={
            <div role="status" className="p-8 text-muted-foreground">
              Loading {appId}…
            </div>
          }
        >
          <AppHost
            appId={appId}
            basePath={`/${appId}`}
            className="min-h-0 w-full flex-1"
            fallback={({ error, retry }) => (
              <AppFailure
                name={appId === 'discovery' ? 'Discovery' : 'Geology'}
                error={error.message}
                onRetry={retry}
              />
            )}
          />
        </Suspense>
      )}
    </TestShell>
  );
}

if (window.location.pathname === '/') {
  await navigation.navigate('/discovery/', { replace: true });
}
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('The shell HTML is missing #root.');
const root = createRoot(rootElement);
root.render(
  <MfeHostProvider value={hostEnvironment}>
    <ShellApplication />
  </MfeHostProvider>,
);

watchRemoteUpdates(remotes, window);
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    widgetFixture.dispose();
    session.dispose();
    navigation.dispose();
  }
});
