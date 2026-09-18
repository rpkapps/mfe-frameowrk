import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppRuntime, createBrowserNavigation } from '@company/mfe-host';
import { AppHost, createReactAdapter } from '@company/mfe-react';
import { watchRemoteUpdates } from '@company/mfe-rsbuild/runtime';
import { registry, overrideWarnings, remotes } from './registry';
import { TestShell, AppFailure } from './shell';
import './global.css';

const navigation = createBrowserNavigation(window);
const runtime = createAppRuntime({ registry, adapters: [createReactAdapter()], reportError() {} });
const user = { id: 'test-engineer', name: 'Sarah Elliott' };
const groups = ['test-engineers'];
const themeKey = 'mfe.test-shell.theme';

function readTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem(themeKey) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function ShellApplication() {
  const location = useSyncExternalStore(
    (listener) => navigation.subscribe(listener),
    () => navigation.getSnapshot(),
  );
  const appId = location.pathname.startsWith('/geology') ? 'geology' : 'discovery';
  const [theme, setTheme] = useState(readTheme);
  const shellState = useMemo(() => ({ user, groups, theme }), [theme]);
  const createNavigation = useCallback(
    () => navigation.createBoundaryHistory(`/${appId}`),
    [appId],
  );
  useEffect(() => {
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
      <AppHost
        runtime={runtime}
        id={appId}
        basePath={`/${appId}`}
        shellState={shellState}
        createNavigation={createNavigation}
        className="min-h-0 w-full flex-1"
        renderStatus={(state, retry) =>
          state.status === 'error' ? (
            <AppFailure
              name={appId === 'discovery' ? 'Discovery' : 'Geology'}
              error={state.error.message}
              onRetry={retry}
            />
          ) : state.status === 'pending' ? (
            <div role="status" className="p-8 text-muted-foreground">
              Loading {appId}…
            </div>
          ) : null
        }
      />
    </TestShell>
  );
}

if (window.location.pathname === '/') {
  await navigation.navigate('/discovery/', { replace: true });
}
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('The shell HTML is missing #root.');
const root = createRoot(rootElement);
root.render(<ShellApplication />);

watchRemoteUpdates(remotes, window);
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) navigation.dispose();
});
