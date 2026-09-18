"use client"

import * as React from "react"
import { cn } from "cn"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@tecton/react/components/resizable"

/**
 * Tecton AppShell — the application frame: a solid top navigation bar,
 * an optional left rail/sidebar, the main work area and an optional right
 * aside for tool panels. Pure layout; combine with `Sidebar` for the
 * collapsible navigation or with `Panel` for the aside.
 */
function AppShell({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-shell"
      className={cn(
        "grid h-svh w-full grid-rows-[auto_1fr] overflow-hidden bg-background text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AppShellHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="app-shell-header"
      className={cn(
        "flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle bg-card px-3 text-sm",
        className
      )}
      {...props}
    />
  )
}

function AppShellBrand({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-shell-brand"
      className={cn("flex items-center gap-2 font-medium [&_svg]:size-5", className)}
      {...props}
    />
  )
}

function AppShellNav({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="app-shell-nav"
      className={cn("flex min-w-0 flex-1 items-center gap-1", className)}
      {...props}
    />
  )
}

function AppShellHeaderActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-shell-header-actions"
      className={cn("ml-auto flex shrink-0 items-center gap-1", className)}
      {...props}
    />
  )
}

function AppShellBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-shell-body"
      className={cn("flex min-h-0 w-full overflow-hidden", className)}
      {...props}
    />
  )
}

function AppShellSidebar({ className, ...props }: React.ComponentProps<"aside">) {
  return (
    <aside
      data-slot="app-shell-sidebar"
      className={cn(
        "flex w-64 shrink-0 flex-col overflow-auto border-r border-border-subtle bg-sidebar text-sidebar-foreground",
        className
      )}
      {...props}
    />
  )
}

function AppShellMain({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="app-shell-main"
      className={cn("relative min-w-0 flex-1 overflow-auto", className)}
      {...props}
    />
  )
}

function AppShellAside({ className, ...props }: React.ComponentProps<"aside">) {
  return (
    <aside
      data-slot="app-shell-aside"
      className={cn(
        "flex w-80 shrink-0 flex-col overflow-auto border-l border-border-subtle bg-card",
        className
      )}
      {...props}
    />
  )
}

/**
 * Resizable split inside the body: wrap the main area and a full-height
 * aside (or sidebar) in `AppShellSplit`, each in an `AppShellSplitPanel`,
 * with an `AppShellSplitHandle` between them. Sizes accept the
 * react-resizable-panels units (`"320px"`, `"25%"`, `"20rem"`).
 */
function AppShellSplit({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof ResizablePanelGroup>) {
  return (
    <ResizablePanelGroup
      data-slot="app-shell-split"
      orientation={orientation}
      className={cn("min-h-0 min-w-0 flex-1", className)}
      {...props}
    />
  )
}

function AppShellSplitPanel({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePanel>) {
  return (
    <ResizablePanel
      data-slot="app-shell-split-panel"
      className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden", className)}
      {...props}
    />
  )
}

function AppShellSplitHandle({
  className,
  ...props
}: React.ComponentProps<typeof ResizableHandle>) {
  return (
    <ResizableHandle
      data-slot="app-shell-split-handle"
      className={cn(
        "bg-border-subtle transition-colors after:z-10 after:w-1.5 hover:bg-primary/60 focus-visible:bg-primary active:bg-primary",
        className
      )}
      {...props}
    />
  )
}

/**
 * True once the viewport is at least `minWidth` pixels wide (false during
 * SSR). Use it to decide whether a full-height aside is rendered at all.
 */
function useMinWidth(minWidth: number) {
  const query = `(min-width: ${minWidth}px)`
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query]
  )
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}

export {
  AppShell,
  AppShellHeader,
  AppShellBrand,
  AppShellNav,
  AppShellHeaderActions,
  AppShellBody,
  AppShellSidebar,
  AppShellMain,
  AppShellAside,
  AppShellSplit,
  AppShellSplitPanel,
  AppShellSplitHandle,
  useMinWidth,
}
