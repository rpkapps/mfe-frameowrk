import type { AppFinderTone } from "@tecton/react/tecton/app-finder";
export type AppCategory = "Subsurface" | "Wells" | "Facilities" | "Economics" | "Operations" | "Data & Admin";
export type ShellApp = {
    id: string;
    /** Short code shown in the app finder trigger. */
    code: string;
    name: string;
    description: string;
    category: AppCategory;
};
export type ShellUser = {
    name: string;
    initials: string;
    email: string;
    role: string;
};
export type ShellCommand = {
    id: string;
    label: string;
    group: "Navigate" | "Actions" | "Help";
    shortcut?: string;
};
/** Tile colour of each category in the app finder and command palette. */
export declare const appTones: Record<AppCategory, AppFinderTone>;
export declare const appCategories: AppCategory[];
/** A representative slice of a large app catalogue, grouped by category. */
export declare const apps: ShellApp[];
export declare const recentAppIds: string[];
export declare const currentUser: ShellUser;
export declare const commands: ShellCommand[];
/** Groups apps by category, keeping the catalogue's category order. */
export declare function groupApps(list: ShellApp[]): {
    category: AppCategory;
    apps: ShellApp[];
}[];
