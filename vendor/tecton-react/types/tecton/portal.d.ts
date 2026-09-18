import * as React from "react";
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
    container: HTMLElement | null | (() => HTMLElement | null);
    children: React.ReactNode;
};
declare function PortalProvider({ container, children }: PortalProviderProps): import("react/jsx-runtime").JSX.Element;
/**
 * The element overlays currently portal into, or `null` when no
 * `PortalProvider` is in scope (React Aria then uses `document.body`).
 */
declare function usePortalContainer(): HTMLElement | null;
/** The concrete target passed to React Aria Components overlay primitives. */
declare function usePortalTarget(): HTMLElement | undefined;
export { PortalProvider, usePortalContainer, usePortalTarget };
export type { PortalProviderProps };
