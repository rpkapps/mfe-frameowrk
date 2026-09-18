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
export default function Page(): import("react/jsx-runtime").JSX.Element;
export { ShellHeader } from "./components/shell-header";
export { ShellCommandPalette } from "./components/shell-command-palette";
export { ShellShortcutsDialog } from "./components/shell-shortcuts-dialog";
export { apps, appCategories, commands, currentUser, groupApps, recentAppIds, } from "./data";
export type { AppCategory, ShellApp, ShellCommand, ShellUser } from "./data";
