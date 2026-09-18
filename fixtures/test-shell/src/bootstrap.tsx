import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppMount } from '@company/mfe-react/internal';
import { createShellNavigation } from './browser-boundary';
import { loadApp, overrideWarnings, remotes } from './registry';
import { TestShell } from './shell';
import './global.css';
import './styles.css';

const navigation = createShellNavigation(window);
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
  const target = useRef<HTMLDivElement>(null);
  const active = useRef<ReturnType<typeof createAppMount> | undefined>(undefined);
  const [theme, setTheme] = useState(readTheme);
  const themeRef = useRef(theme);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const retryApp = useRef<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    themeRef.current = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(themeKey, theme);
    } catch {
      /* Storage is optional. */
    }
    active.current
      ?.updateShellState({ user, groups, theme })
      .catch((cause: unknown) => setError(String(cause)));
  }, [theme]);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    let retired = false;
    const retry = retryApp.current === appId;
    retryApp.current = undefined;
    let mount: ReturnType<typeof createAppMount> | undefined;
    async function activate() {
      setError(undefined);
      setLoading(true);
      const definition = await loadApp(appId, retry);
      if (retired) return;
      mount = createAppMount({
        definition,
        basePath: `/${appId}`,
        target: element!,
        shellState: { user, groups, theme: themeRef.current },
        createHistory: () => navigation.createBoundaryHistory(`/${appId}`),
        reportError: (failure) => {
          if (!retired) setError(failure.message);
        },
      });
      mount.placement.dataset.mfeScope = appId;
      mount.placement.className = 'mfe-placement';
      active.current = mount;
      await mount.start();
      if (!retired) setLoading(false);
    }
    activate().catch((cause: unknown) => {
      if (!retired) {
        setError(String(cause));
        setLoading(false);
      }
    });
    return () => {
      retired = true;
      active.current = undefined;
      mount?.handle.dispose().catch((cause: unknown) => console.error('App cleanup failed', cause));
    };
  }, [appId, attempt]);

  return (
    <TestShell
      appId={appId}
      onAppChange={(next) => {
        navigation.navigate(`/${next}/`).catch((cause: unknown) => setError(String(cause)));
      }}
      theme={theme}
      onThemeChange={setTheme}
      {...(error ? { error } : {})}
      onRetry={() => {
        retryApp.current = appId;
        setAttempt((value) => value + 1);
      }}
    >
      {overrideWarnings.length > 0 && (
        <div role="status" className="shell-notice">
          {overrideWarnings.join(' ')}
        </div>
      )}
      {loading && !error && (
        <div role="status" className="shell-loading">
          Loading {appId}…
        </div>
      )}
      <div ref={target} className="mfe-target" aria-label={`${appId} application`} />
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

// A remote rebuild intentionally reloads the page. URL + persisted shell theme
// survive; component-local state does not. This is the explicit test-shell
// fallback until remote Fast Refresh has passed the complete integration gate.
for (const remote of remotes) {
  const events = new EventSource(new URL('/__mfe_events', remote.entry));
  let previous: string | undefined;
  events.onmessage = (event: MessageEvent<string>) => {
    if (previous && previous !== event.data) window.location.reload();
    previous = event.data;
  };
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) events.close();
  });
}
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) navigation.dispose();
});
