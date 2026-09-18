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
 * attributes. The provider is a thin adapter over React Aria's portal
 * context; nothing in the DOM, `document.body` or React's portals is patched.
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
export { PortalProvider, usePortalContainer };
export type { PortalProviderProps };
