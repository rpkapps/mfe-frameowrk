import * as React from "react";
import { Button } from "@tecton/react/components/button";
import { DropdownMenuTrigger } from "@tecton/react/components/dropdown-menu";
/**
 * Tecton ShellActions — the global action cluster at the end of the shell
 * header: command palette trigger, icon actions (help, settings, release
 * notes, bug report) and the user menu. These are owned by the shell, not
 * by the mounted application.
 */
declare function ShellActions({ className, ...props }: React.ComponentProps<"div">): import("react/jsx-runtime").JSX.Element;
type ShellActionProps = React.ComponentProps<typeof Button> & {
    /** Accessible name, also shown as the tooltip. */
    label: string;
    /**
     * Optional shortcut hint rendered in the tooltip, in `shortcuts` key
     * syntax (`"mod+k"`, `"?"`, `"g w"`).
     */
    shortcut?: string;
};
declare function ShellAction({ label, shortcut, className, children, ...props }: ShellActionProps): import("react/jsx-runtime").JSX.Element;
type ShellCommandTriggerProps = Omit<React.ComponentProps<typeof Button>, "children"> & {
    children?: React.ReactNode;
    /** Shortcut hint shown at the end of the trigger. */
    shortcut?: React.ReactNode;
};
/**
 * Command palette trigger: a search-styled field on `md` and up, an icon
 * button below it.
 */
declare function ShellCommandTrigger({ className, children, shortcut, ...props }: ShellCommandTriggerProps): import("react/jsx-runtime").JSX.Element;
declare function ShellDivider({ className, ...props }: React.ComponentProps<"span">): import("react/jsx-runtime").JSX.Element;
type ShellOverflowProps = Omit<React.ComponentProps<typeof DropdownMenuTrigger>, "children"> & {
    /** Accessible name of the trigger (default "More"). */
    label?: string;
    /** Menu contents (`DropdownMenuGroup`, `DropdownMenuItem`, …). */
    children: React.ReactNode;
    className?: string;
};
/**
 * Overflow menu for actions that do not fit a narrow header. Pair it with
 * responsive classes: hide the icon actions below a breakpoint and show
 * this menu instead.
 */
declare function ShellOverflow({ label, className, children, ...props }: ShellOverflowProps): import("react/jsx-runtime").JSX.Element;
type ShellUserMenuProps = Omit<React.ComponentProps<typeof DropdownMenuTrigger>, "children"> & {
    user: {
        name: string;
        initials: string;
        image?: string;
    };
    /** Menu contents (`DropdownMenuGroup`, `DropdownMenuItem`, …). */
    children: React.ReactNode;
    className?: string;
};
declare function ShellUserMenu({ user, className, children, ...props }: ShellUserMenuProps): import("react/jsx-runtime").JSX.Element;
export { ShellActions, ShellAction, ShellCommandTrigger, ShellDivider, ShellOverflow, ShellUserMenu, };
export type { ShellActionProps, ShellCommandTriggerProps, ShellOverflowProps, ShellUserMenuProps, };
