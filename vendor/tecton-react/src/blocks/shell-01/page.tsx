"use client"

import * as React from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
} from "@tecton/react/components/breadcrumb"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@tecton/react/components/empty"
import {
  AppShell,
  AppShellBody,
  AppShellMain,
} from "@tecton/react/tecton/app-shell"
import {
  createShortcutRegistry,
  ShortcutKeys,
  ShortcutsProvider,
  useShortcut,
} from "@tecton/react/tecton/shortcuts"

import { ShellHeader } from "./components/shell-header"
import { apps } from "./data"
import type { ShellApp } from "./data"

/**
 * The micro-frontend host shell: a top bar owned by the host (app finder,
 * home, context, command palette, help, release notes, bug report,
 * settings and the user menu) and one region below that the mounted
 * application fills with its own layout.
 *
 * The host creates one shortcut registry and provides it to the tree; the
 * mounted application registers its shortcuts against it (here with
 * `useShortcut`, or with `registry.register` from outside React) and the
 * shell lists them in the command palette and the `?` dialog.
 */
export default function Page() {
  const [app, setApp] = React.useState<ShellApp>(apps[0])
  const [registry] = React.useState(createShortcutRegistry)

  return (
    <ShortcutsProvider registry={registry}>
      <AppShell>
        <ShellHeader appId={app.id} onAppChange={setApp}>
          <Breadcrumb>
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem className="hidden md:inline-flex">
                <BreadcrumbLink href="#">{app.name}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">Orion Discovery</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </ShellHeader>
        <AppShellBody>
          <AppShellMain className="flex">
            <MountedApp key={app.id} app={app} />
          </AppShellMain>
        </AppShellBody>
      </AppShell>
    </ShortcutsProvider>
  )
}

/** Stands in for the mounted application: registers its own shortcuts. */
function MountedApp({ app }: { app: ShellApp }) {
  const [lastAction, setLastAction] = React.useState<string | null>(null)

  useShortcut({
    id: `${app.id}.new-well`,
    keys: "n",
    label: "Create well",
    group: app.name,
    onAction: () => setLastAction("Create well"),
  })
  useShortcut({
    id: `${app.id}.go-wells`,
    keys: "g w",
    label: "Go to wells",
    group: app.name,
    onAction: () => setLastAction("Go to wells"),
  })
  useShortcut({
    id: `${app.id}.save`,
    keys: "mod+s",
    label: "Save project",
    group: app.name,
    onAction: () => setLastAction("Save project"),
  })

  return (
    <Empty className="m-auto max-w-md">
      <EmptyHeader>
        <EmptyTitle>{app.name} mounts here</EmptyTitle>
        <EmptyDescription>
          The shell owns the header. Everything below it belongs to the
          application, which chooses its own page layout and registers its
          keyboard shortcuts with the shell.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <span>
            Try <ShortcutKeys keys="n" />, <ShortcutKeys keys="g w" /> or{" "}
            <ShortcutKeys keys="?" />
          </span>
          <span aria-live="polite">
            {lastAction ? (
              <>
                Last action: <span className="font-medium text-foreground">{lastAction}</span>
              </>
            ) : (
              "No shortcut pressed yet"
            )}
          </span>
        </div>
      </EmptyContent>
    </Empty>
  )
}

export { ShellHeader } from "./components/shell-header"
export { ShellCommandPalette } from "./components/shell-command-palette"
export { ShellShortcutsDialog } from "./components/shell-shortcuts-dialog"
export {
  apps,
  appCategories,
  commands,
  currentUser,
  groupApps,
  recentAppIds,
} from "./data"
export type { AppCategory, ShellApp, ShellCommand, ShellUser } from "./data"
