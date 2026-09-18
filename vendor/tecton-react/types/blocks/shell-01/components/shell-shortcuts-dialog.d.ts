import type { Shortcut } from "@tecton/react/tecton/shortcuts";
type ShellShortcutsDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The registered shortcuts, from `useShortcuts()`. */
    shortcuts: Shortcut[];
};
/** Groups the visible shortcuts by their `group`, in registration order. */
declare function groupShortcuts(shortcuts: Shortcut[]): [string, Shortcut[]][];
/**
 * Keyboard shortcut reference for the shell: every shortcut registered by
 * the host and the mounted application, grouped. Opened with `?`.
 */
declare function ShellShortcutsDialog({ open, onOpenChange, shortcuts, }: ShellShortcutsDialogProps): import("react/jsx-runtime").JSX.Element;
export { ShellShortcutsDialog, groupShortcuts };
export type { ShellShortcutsDialogProps };
