import * as React from "react";
import { AppShellHeader } from "@tecton/react/tecton/app-shell";
import type { ShellApp, ShellUser } from "../data";
type ShellHeaderProps = Omit<React.ComponentProps<typeof AppShellHeader>, "children"> & {
    apps?: ShellApp[];
    /** Id of the mounted application. */
    appId?: string;
    onAppChange?: (app: ShellApp) => void;
    user?: ShellUser;
    /** Ids of recently used apps, listed first in the finder. */
    recentAppIds?: string[];
    /** Context shown after the home button: breadcrumb, workspace tabs, etc. */
    children?: React.ReactNode;
};
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
declare function ShellHeader(props: ShellHeaderProps): import("react/jsx-runtime").JSX.Element;
export { ShellHeader };
export type { ShellHeaderProps };
