"use client"

import * as React from "react"
import { cn } from "cn"
import {
  BugIcon,
  CircleHelpIcon,
  HomeIcon,
  KeyboardIcon,
  LogOutIcon,
  SettingsIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react"

import { Button } from "@tecton/react/components/button"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@tecton/react/components/dropdown-menu"
import {
  AppFinder,
  AppFinderGroup,
  AppFinderInput,
  AppFinderItem,
  AppFinderList,
  AppFinderMenu,
  AppFinderTrigger,
} from "@tecton/react/tecton/app-finder"
import { AppShellHeader, AppShellNav } from "@tecton/react/tecton/app-shell"
import {
  ShellAction,
  ShellActions,
  ShellCommandTrigger,
  ShellDivider,
  ShellOverflow,
  ShellUserMenu,
} from "@tecton/react/tecton/shell-actions"
import {
  ShortcutsProvider,
  useShortcut,
  useShortcuts,
} from "@tecton/react/tecton/shortcuts"

import { ShellCommandPalette } from "./shell-command-palette"
import { ShellShortcutsDialog } from "./shell-shortcuts-dialog"
import {
  apps as defaultApps,
  appTones,
  currentUser,
  groupApps,
  recentAppIds as defaultRecentAppIds,
} from "../data"
import type { ShellApp, ShellUser } from "../data"

type ShellHeaderProps = Omit<
  React.ComponentProps<typeof AppShellHeader>,
  "children"
> & {
  apps?: ShellApp[]
  /** Id of the mounted application. */
  appId?: string
  onAppChange?: (app: ShellApp) => void
  user?: ShellUser
  /** Ids of recently used apps, listed first in the finder. */
  recentAppIds?: string[]
  /** Context shown after the home button: breadcrumb, workspace tabs, etc. */
  children?: React.ReactNode
}

/**
 * The host's top bar: app finder, home, application context and the
 * global action cluster. The mounted application only renders inside
 * `children` (its context) and the main region below.
 *
 * Responsive: the command trigger shrinks to an icon below `md`, and the
 * secondary actions (what's new, bug report, settings) fold into an
 * overflow menu below `lg`.
 *
 * Shortcuts: the header registers ⌘K / Ctrl+K (command palette) and `?`
 * (shortcut list) with the nearest `ShortcutsProvider`, creating one when
 * the host has none. Applications register theirs with `useShortcut` or
 * `registry.register`; both the palette and the `?` dialog list them.
 */
function ShellHeader(props: ShellHeaderProps) {
  return (
    <ShortcutsProvider>
      <ShellHeaderInner {...props} />
    </ShortcutsProvider>
  )
}

function ShellHeaderInner({
  className,
  apps = defaultApps,
  appId,
  onAppChange,
  user = currentUser,
  recentAppIds = defaultRecentAppIds,
  children,
  ...props
}: ShellHeaderProps) {
  const [internalAppId, setInternalAppId] = React.useState(apps[0]?.id)
  const currentId = appId ?? internalAppId
  const current = apps.find((app) => app.id === currentId) ?? apps[0]
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)
  const recent = recentAppIds
    .map((id) => apps.find((item) => item.id === id))
    .filter(
      (item): item is ShellApp => item !== undefined && item.id !== current.id
    )
  const groups = groupApps(apps)
  const shortcuts = useShortcuts()

  const selectApp = (app: ShellApp) => {
    setInternalAppId(app.id)
    onAppChange?.(app)
  }

  useShortcut({
    id: "shell.palette",
    keys: "mod+k",
    label: "Search or jump to…",
    group: "Shell",
    onAction: () => setPaletteOpen((open) => !open),
  })
  useShortcut({
    id: "shell.shortcuts",
    keys: "?",
    label: "Keyboard shortcuts",
    group: "Shell",
    onAction: () => setShortcutsOpen((open) => !open),
  })

  const secondary = [
    { id: "whats-new", label: "What's new", icon: SparklesIcon },
    { id: "bug", label: "Report a bug", icon: BugIcon },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ]

  return (
    <AppShellHeader
      data-slot="shell-header"
      className={cn("gap-1 px-2 sm:gap-2", className)}
      {...props}
    >
      <AppFinder>
        <AppFinderTrigger name={current.name} tone={appTones[current.category]}>
          {current.code}
        </AppFinderTrigger>
        <AppFinderMenu>
          <AppFinderInput />
          <AppFinderList
            onAction={(key) => {
              const id = String(key).replace(/^recent-/, "")
              const app = apps.find((item) => item.id === id)
              if (app) selectApp(app)
            }}
          >
            {recent.length ? (
              <AppFinderGroup heading="Recent" hideWhileSearching>
                {recent.map((app) => (
                  <AppFinderItem
                    key={`recent-${app.id}`}
                    id={`recent-${app.id}`}
                    icon={app.code}
                    tone={appTones[app.category]}
                    name={app.name}
                    description={app.description}
                    keywords={[app.code, app.category]}
                  />
                ))}
              </AppFinderGroup>
            ) : null}
            {groups.map((group) => (
              <AppFinderGroup key={group.category} heading={group.category}>
                {group.apps.map((app) => (
                  <AppFinderItem
                    key={app.id}
                    id={app.id}
                    icon={app.code}
                    tone={appTones[app.category]}
                    name={app.name}
                    description={app.description}
                    keywords={[app.code, app.category]}
                    isCurrent={app.id === current.id}
                  />
                ))}
              </AppFinderGroup>
            ))}
          </AppFinderList>
        </AppFinderMenu>
      </AppFinder>
      <ShellDivider className="hidden sm:block" />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Home"
        className="hidden sm:inline-flex"
      >
        <HomeIcon />
      </Button>
      <AppShellNav className="overflow-hidden">{children}</AppShellNav>
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
        {secondary.map((action) => (
          <ShellAction
            key={action.id}
            label={action.label}
            className="hidden lg:inline-flex"
          >
            <action.icon />
          </ShellAction>
        ))}
        <ShellOverflow className="lg:hidden">
          <DropdownMenuGroup>
            {secondary.map((action) => (
              <DropdownMenuItem key={action.id} textValue={action.label}>
                <action.icon /> {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </ShellOverflow>
        <ShellUserMenu user={user}>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <div className="grid leading-tight">
                <span className="truncate font-medium text-foreground">
                  {user.name}
                </span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem textValue="Profile">
              <UserIcon /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem textValue="Preferences">
              <SettingsIcon /> Preferences
            </DropdownMenuItem>
            <DropdownMenuItem
              textValue="Keyboard shortcuts"
              onAction={() => setShortcutsOpen(true)}
            >
              <KeyboardIcon /> Keyboard shortcuts
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem textValue="Sign out">
              <LogOutIcon /> Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </ShellUserMenu>
      </ShellActions>
      <ShellCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        apps={apps}
        shortcuts={shortcuts}
        onSelectApp={selectApp}
      />
      <ShellShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        shortcuts={shortcuts}
      />
    </AppShellHeader>
  )
}

export { ShellHeader }
export type { ShellHeaderProps }
