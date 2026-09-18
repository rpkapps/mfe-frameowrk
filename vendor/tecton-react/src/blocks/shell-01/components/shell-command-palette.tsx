"use client"

import * as React from "react"
import { AppWindowIcon, CommandIcon, KeyboardIcon } from "lucide-react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@tecton/react/components/command"
import { ShortcutKeys } from "@tecton/react/tecton/shortcuts"
import type { Shortcut } from "@tecton/react/tecton/shortcuts"

import {
  apps as defaultApps,
  commands as defaultCommands,
  groupApps,
} from "../data"
import type { ShellApp, ShellCommand } from "../data"

type ShellCommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  apps?: ShellApp[]
  /** Static host commands without a key binding. */
  commands?: ShellCommand[]
  /** Registered shortcuts (`useShortcuts()`), listed under their groups and runnable from here. */
  shortcuts?: Shortcut[]
  onSelectApp?: (app: ShellApp) => void
  onRunCommand?: (command: ShellCommand) => void
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const group = key(item)
    map.set(group, [...(map.get(group) ?? []), item])
  }
  return [...map.entries()]
}

/**
 * Shell command palette: switch application, run a registered shortcut or
 * a host command. Opened with ⌘K / Ctrl+K from anywhere in the shell.
 */
function ShellCommandPalette({
  open,
  onOpenChange,
  apps = defaultApps,
  commands = defaultCommands,
  shortcuts = [],
  onSelectApp,
  onRunCommand,
}: ShellCommandPaletteProps) {
  const shortcutGroups = React.useMemo(
    () =>
      groupBy(
        shortcuts.filter((shortcut) => !shortcut.hidden),
        (shortcut) => shortcut.group ?? "General"
      ),
    [shortcuts]
  )
  // A registered shortcut supersedes a static command with the same id,
  // label or keys, so an application binding a host command lists once.
  const commandGroups = React.useMemo(() => {
    const takenIds = new Set(shortcuts.map((shortcut) => shortcut.id))
    const takenLabels = new Set(shortcuts.map((shortcut) => shortcut.label.toLowerCase()))
    const takenKeys = new Set(shortcuts.map((shortcut) => shortcut.keys.toLowerCase()))
    return groupBy(
      commands.filter(
        (command) =>
          !takenIds.has(command.id) &&
          !takenLabels.has(command.label.toLowerCase()) &&
          !(command.shortcut && takenKeys.has(command.shortcut.toLowerCase()))
      ),
      (command) => command.group
    )
  }, [commands, shortcuts])

  const close = () => onOpenChange(false)

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command className="rounded-none bg-transparent">
      <CommandInput placeholder="Search apps and commands…" />
      <CommandList
        className="max-h-[60svh]"
        renderEmptyState={() => <CommandEmpty>No results found.</CommandEmpty>}
      >
        {groupApps(apps).map((group) => (
          <CommandGroup key={group.category} heading={group.category}>
            {group.apps.map((app) => (
              <CommandItem
                key={app.id}
                id={`app-${app.id}`}
                textValue={`${app.code} ${app.name} ${app.category}`}
                onAction={() => {
                  onSelectApp?.(app)
                  close()
                }}
              >
                <AppWindowIcon />
                <span>{app.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {app.code}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {shortcutGroups.map(([group, items]) => (
          <React.Fragment key={`shortcuts-${group}`}>
            <CommandSeparator />
            <CommandGroup heading={group}>
              {items.map((shortcut) => (
                <CommandItem
                  key={shortcut.id}
                  id={`shortcut-${shortcut.id}`}
                  textValue={shortcut.label}
                  onAction={() => {
                    close()
                    shortcut.onAction(new KeyboardEvent("keydown"))
                  }}
                >
                  <KeyboardIcon />
                  <span>{shortcut.label}</span>
                  <CommandShortcut>
                    <ShortcutKeys keys={shortcut.keys} />
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </React.Fragment>
        ))}
        {commandGroups.map(([group, items]) => (
          <React.Fragment key={`commands-${group}`}>
            <CommandSeparator />
            <CommandGroup heading={group}>
              {items.map((command) => (
                <CommandItem
                  key={command.id}
                  id={command.id}
                  textValue={command.label}
                  onAction={() => {
                    onRunCommand?.(command)
                    close()
                  }}
                >
                  <CommandIcon />
                  <span>{command.label}</span>
                  {command.shortcut ? (
                    <CommandShortcut>{command.shortcut}</CommandShortcut>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
      </Command>
    </CommandDialog>
  )
}

export { ShellCommandPalette }
export type { ShellCommandPaletteProps }
