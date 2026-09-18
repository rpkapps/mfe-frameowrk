import type { Shortcut } from "@tecton/react/tecton/shortcuts";
import type { ShellApp, ShellCommand } from "../data";
type ShellCommandPaletteProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    apps?: ShellApp[];
    /** Static host commands without a key binding. */
    commands?: ShellCommand[];
    /** Registered shortcuts (`useShortcuts()`), listed under their groups and runnable from here. */
    shortcuts?: Shortcut[];
    onSelectApp?: (app: ShellApp) => void;
    onRunCommand?: (command: ShellCommand) => void;
};
/**
 * Shell command palette: switch application, run a registered shortcut or
 * a host command. Opened with ⌘K / Ctrl+K from anywhere in the shell.
 */
declare function ShellCommandPalette({ open, onOpenChange, apps, commands, shortcuts, onSelectApp, onRunCommand, }: ShellCommandPaletteProps): import("react/jsx-runtime").JSX.Element;
export { ShellCommandPalette };
export type { ShellCommandPaletteProps };
