import * as React from "react";
/**
 * Tecton Shortcuts — a keyboard shortcut registry for the micro-frontend
 * shell. The host creates one registry and listens for keys once; the
 * mounted applications register their own shortcuts against it (from React
 * with `useShortcut`, or from anywhere with `registry.register`) and get
 * them listed in the shell's help and command palette.
 *
 * Key syntax: chords are `+`-separated (`mod+k`, `shift+?`, `alt+enter`),
 * sequences are space-separated (`g w`). `mod` is ⌘ on macOS and Ctrl
 * elsewhere.
 */
type Shortcut = {
    /** Stable id; registering the same id again replaces the earlier one. */
    id: string;
    /** Key chord or sequence, e.g. `"mod+k"`, `"?"`, `"g w"`. */
    keys: string;
    /** Shown in shortcut lists. */
    label: string;
    /** Heading the shortcut is listed under (default "General"). */
    group?: string;
    onAction: (event: KeyboardEvent) => void;
    /**
     * Fire while typing in an input, textarea or editable element. Defaults
     * to true for chords with Ctrl / ⌘ / Alt and false otherwise.
     */
    allowInInput?: boolean;
    /** Skip the shortcut (and let the key through) when this returns false. */
    isEnabled?: () => boolean;
    /** Keep the shortcut out of lists. */
    hidden?: boolean;
};
type ShortcutRegistry = {
    /** Registers one or more shortcuts; returns a function that removes them. */
    register: (shortcut: Shortcut | Shortcut[]) => () => void;
    unregister: (id: string) => void;
    /** Registered shortcuts, in registration order. */
    getAll: () => Shortcut[];
    subscribe: (listener: () => void) => () => void;
    /** Dispatches a key event; returns true when a shortcut handled it. */
    handleKeyDown: (event: KeyboardEvent) => boolean;
};
/** Creates a registry. The host owns it and hands it to the mounted applications. */
declare function createShortcutRegistry(): ShortcutRegistry;
type ShortcutsProviderProps = {
    /** A registry created with `createShortcutRegistry`; one is created when omitted. */
    registry?: ShortcutRegistry;
    /** Element that receives the key events (default: `document`). */
    target?: HTMLElement | Document | null;
    children: React.ReactNode;
};
/**
 * Listens for key events once and makes the registry available to the tree.
 * Nested providers without a `registry` of their own reuse the parent's, so
 * a component can wrap itself in one and still share the host's registry.
 */
declare function ShortcutsProvider({ registry, target, children }: ShortcutsProviderProps): import("react/jsx-runtime").JSX.Element;
/** The registry of the nearest `ShortcutsProvider`. */
declare function useShortcutRegistry(): ShortcutRegistry;
/** The registered shortcuts, re-rendering as applications register and unregister. */
declare function useShortcuts(): Shortcut[];
/**
 * Registers a shortcut for the lifetime of the component. The handler
 * always sees the latest render, so it needs no dependency list.
 */
declare function useShortcut(shortcut: Omit<Shortcut, "onAction"> & {
    onAction: Shortcut["onAction"];
}): void;
/** Display labels for a shortcut: one array of key caps per chord. */
declare function formatShortcut(keys: string, isMac?: boolean): string[][];
/**
 * Renders a shortcut as key caps (`Kbd`) joined with "+" (`Ctrl + K`,
 * `G + W`); the accessible name spells a sequence out ("G, then W").
 */
declare function ShortcutKeys({ keys, className, ...props }: React.ComponentProps<"span"> & {
    keys: string;
}): import("react/jsx-runtime").JSX.Element;
export { createShortcutRegistry, ShortcutsProvider, useShortcutRegistry, useShortcuts, useShortcut, formatShortcut, ShortcutKeys, };
export type { Shortcut, ShortcutRegistry, ShortcutsProviderProps };
