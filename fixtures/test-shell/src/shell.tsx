import { useState } from 'react';
import type { ReactNode } from 'react';
import { ShellCommandPalette } from '@tecton/react/blocks/shell-01/components/shell-command-palette.tsx';
import { ShellShortcutsDialog } from '@tecton/react/blocks/shell-01/components/shell-shortcuts-dialog.tsx';
import type { ShellApp } from '@tecton/react/blocks/shell-01/data.ts';
import { Button } from '@tecton/react/components/button';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@tecton/react/components/dropdown-menu';
import {
  ChevronRightIcon,
  CircleHelpIcon,
  HomeIcon,
  KeyboardIcon,
  MoonIcon,
  SunIcon,
} from '@tecton/react/icons/lucide-compat';
import {
  AppFinder,
  AppFinderGroup,
  AppFinderInput,
  AppFinderItem,
  AppFinderList,
  AppFinderMenu,
  AppFinderTrigger,
} from '@tecton/react/tecton/app-finder';
import {
  AppShell,
  AppShellBody,
  AppShellHeader,
  AppShellMain,
  AppShellNav,
} from '@tecton/react/tecton/app-shell';
import {
  ShellAction,
  ShellActions,
  ShellCommandTrigger,
  ShellDivider,
  ShellUserMenu,
} from '@tecton/react/tecton/shell-actions';
import { ShortcutsProvider, useShortcut, useShortcuts } from '@tecton/react/tecton/shortcuts';

export type TestAppId = 'discovery' | 'geology';

export interface TestShellProps {
  readonly appId: TestAppId;
  readonly onAppChange: (appId: TestAppId) => void;
  readonly children: ReactNode;
  readonly theme: 'dark' | 'light';
  readonly onThemeChange: (theme: 'dark' | 'light') => void;
}

const apps: ShellApp[] = [
  {
    id: 'discovery',
    code: 'DSG',
    name: 'Discovery',
    description: 'Field development concepts, decisions and project overview',
    category: 'Subsurface',
  },
  {
    id: 'geology',
    code: 'GEO',
    name: 'Geology',
    description: 'Regional geology, fairway maps and prospect inventory',
    category: 'Subsurface',
  },
];

const currentUser = { name: 'Sarah Elliott', initials: 'SE' };

export function TestShell(props: TestShellProps) {
  return (
    <ShortcutsProvider>
      <ShellLayout {...props} />
    </ShortcutsProvider>
  );
}

/** Adapts Tecton's shell-01 header with working actions for the local catalogue. */
function ShellLayout({ appId, onAppChange, children, theme, onThemeChange }: TestShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcuts = useShortcuts();
  const name = appId === 'discovery' ? 'Discovery' : 'Geology';
  const code = appId === 'discovery' ? 'DSG' : 'GEO';
  const pageTitle = appId === 'discovery' ? 'Orion Discovery' : 'Geologic Background';
  const themeLabel = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;

  const changeTheme = () => onThemeChange(theme === 'dark' ? 'light' : 'dark');
  const selectApp = (id: string) => {
    if (id === 'discovery' || id === 'geology') onAppChange(id);
  };

  useShortcut({
    id: 'shell.palette',
    keys: 'mod+k',
    label: 'Search apps and commands',
    group: 'Shell',
    onAction: () => setPaletteOpen((open) => !open),
  });
  useShortcut({
    id: 'shell.shortcuts',
    keys: '?',
    label: 'Keyboard shortcuts',
    group: 'Shell',
    onAction: () => setShortcutsOpen((open) => !open),
  });
  useShortcut({
    id: 'shell.discovery',
    keys: 'g d',
    label: 'Open Discovery',
    group: 'Navigate',
    onAction: () => onAppChange('discovery'),
  });
  useShortcut({
    id: 'shell.geology',
    keys: 'g m',
    label: 'Open geological map',
    group: 'Navigate',
    onAction: () => onAppChange('geology'),
  });

  return (
    <>
      <a className="test-shell__skip-link" href="#application-workspace">
        Skip to application
      </a>
      <AppShell className="test-shell">
        <AppShellHeader
          className="z-20 h-16 gap-1 px-2 sm:gap-2 sm:px-4"
          aria-label="Application shell"
        >
          <AppFinder>
            <AppFinderTrigger name={name} tone="blue">
              {code}
            </AppFinderTrigger>
            <AppFinderMenu>
              <AppFinderInput />
              <AppFinderList onAction={(key) => selectApp(String(key))}>
                <AppFinderGroup heading="Subsurface">
                  {apps.map((app) => (
                    <AppFinderItem
                      key={app.id}
                      id={app.id}
                      name={app.name}
                      description={app.description}
                      icon={app.code}
                      tone="blue"
                      keywords={[app.code, app.category]}
                      isCurrent={app.id === appId}
                    />
                  ))}
                </AppFinderGroup>
              </AppFinderList>
            </AppFinderMenu>
          </AppFinder>
          <ShellDivider className="hidden sm:block" />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Home — Discovery"
            className="hidden sm:inline-flex"
            onPress={() => onAppChange('discovery')}
          >
            <HomeIcon />
          </Button>
          <AppShellNav aria-label="Application breadcrumb" className="overflow-hidden">
            <span className="hidden shrink-0 text-muted-foreground md:inline">{name}</span>
            <ChevronRightIcon
              aria-hidden="true"
              className="mx-1 hidden size-4 shrink-0 text-muted-foreground md:block"
            />
            <span className="truncate" aria-current="page">
              {pageTitle}
            </span>
          </AppShellNav>
          <ShellActions>
            <ShellCommandTrigger onPress={() => setPaletteOpen(true)}>
              Search or jump to…
            </ShellCommandTrigger>
            <ShellAction
              label="Keyboard shortcuts"
              shortcut="?"
              onPress={() => setShortcutsOpen(true)}
            >
              <CircleHelpIcon />
            </ShellAction>
            <ShellAction label={themeLabel} onPress={changeTheme}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </ShellAction>
            <ShellUserMenu user={currentUser}>
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <span className="grid gap-0.5">
                    <span className="font-medium text-foreground">{currentUser.name}</span>
                    <span>Drilling engineer</span>
                  </span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem textValue={themeLabel} onAction={changeTheme}>
                  {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                  {themeLabel}
                </DropdownMenuItem>
                <DropdownMenuItem
                  textValue="Keyboard shortcuts"
                  onAction={() => setShortcutsOpen(true)}
                >
                  <KeyboardIcon /> Keyboard shortcuts
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </ShellUserMenu>
          </ShellActions>
        </AppShellHeader>
        <AppShellBody>
          <AppShellMain
            id="application-workspace"
            aria-label={`${name} workspace`}
            tabIndex={-1}
            className="test-shell__workspace"
          >
            {children}
          </AppShellMain>
        </AppShellBody>
      </AppShell>
      <ShellCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        apps={apps}
        commands={[]}
        shortcuts={shortcuts}
        onSelectApp={(app) => selectApp(app.id)}
      />
      <ShellShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        shortcuts={shortcuts}
      />
    </>
  );
}

export function AppFailure({
  name,
  error,
  onRetry,
}: {
  readonly name: string;
  readonly error: string;
  readonly onRetry: () => void;
}) {
  return (
    <div className="test-shell__error" role="alert">
      <div className="max-w-md space-y-4 rounded-lg border bg-card p-6 shadow-lg">
        <h1 className="text-lg font-semibold">Unable to open {name}</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onPress={onRetry}>Try again</Button>
      </div>
    </div>
  );
}
