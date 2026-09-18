"use client"

import * as React from "react"

/**
 * Tecton PortalProvider — chooses the element that every Tecton overlay
 * rendered by its children portals into (Dialog, Sheet, Popover, Tooltip,
 * Select, Combobox, Dropdown Menu, Command dialog…). By default overlays
 * portal into `document.body`.
 *
 * Applications that render several isolated React roots on one page (micro
 * frontends, embedded widgets) give each root a body-level container of its
 * own, so the overlays keep escaping `overflow: hidden` ancestors while the
 * container carries that root's scoped styles, theme tokens and ownership
 * attributes. Tecton owns the container context and overlay wrappers pass the
 * resolved container directly to their React Aria Components primitive.
 */
type PortalProviderProps = {
  /**
   * Element the overlays portal into, or a function returning it. `null`
   * clears an outer provider and restores the `document.body` default.
   */
  container: HTMLElement | null | (() => HTMLElement | null)
  children: React.ReactNode
}

type PortalContainer = HTMLElement | null | (() => HTMLElement | null)

const PortalContainerContext = React.createContext<PortalContainer | undefined>(
  undefined
)

function PortalProvider({ container, children }: PortalProviderProps) {
  return <PortalContainerContext value={container}>{children}</PortalContainerContext>
}

/**
 * The element overlays currently portal into, or `null` when no
 * `PortalProvider` is in scope (React Aria then uses `document.body`).
 */
function usePortalContainer(): HTMLElement | null {
  const container = React.useContext(PortalContainerContext)
  return typeof container === "function" ? container() : (container ?? null)
}

/** The concrete target passed to React Aria Components overlay primitives. */
function usePortalTarget(): HTMLElement | undefined {
  const container = usePortalContainer()
  return container ?? (typeof document === "undefined" ? undefined : document.body)
}

export { PortalProvider, usePortalContainer, usePortalTarget }
export type { PortalProviderProps }
