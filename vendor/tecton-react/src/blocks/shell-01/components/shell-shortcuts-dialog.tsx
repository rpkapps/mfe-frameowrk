"use client"

import * as React from "react"

import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tecton/react/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@tecton/react/components/empty"
import { ShortcutKeys } from "@tecton/react/tecton/shortcuts"
import type { Shortcut } from "@tecton/react/tecton/shortcuts"

type ShellShortcutsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The registered shortcuts, from `useShortcuts()`. */
  shortcuts: Shortcut[]
}

/** Groups the visible shortcuts by their `group`, in registration order. */
function groupShortcuts(shortcuts: Shortcut[]) {
  const groups = new Map<string, Shortcut[]>()
  for (const shortcut of shortcuts) {
    if (shortcut.hidden) continue
    const group = shortcut.group ?? "General"
    groups.set(group, [...(groups.get(group) ?? []), shortcut])
  }
  return [...groups.entries()]
}

/**
 * Keyboard shortcut reference for the shell: every shortcut registered by
 * the host and the mounted application, grouped. Opened with `?`.
 */
function ShellShortcutsDialog({
  open,
  onOpenChange,
  shortcuts,
}: ShellShortcutsDialogProps) {
  const groups = React.useMemo(() => groupShortcuts(shortcuts), [shortcuts])

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>
          Shortcuts registered by the shell and by {groups.length > 1 ? "the current application" : "applications"}.
        </DialogDescription>
      </DialogHeader>
      {groups.length === 0 ? (
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyTitle>No shortcuts</EmptyTitle>
            <EmptyDescription>The current application has not registered any.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {groups.map(([group, items]) => (
            <section key={group} className="flex flex-col gap-1">
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">{group}</h3>
              {items.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span className="truncate">{shortcut.label}</span>
                  <ShortcutKeys keys={shortcut.keys} className="shrink-0" />
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </Dialog>
  )
}

export { ShellShortcutsDialog, groupShortcuts }
export type { ShellShortcutsDialogProps }
