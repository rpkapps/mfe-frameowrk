import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { DialogTrigger as DialogTriggerPrimitive, Popover as PopoverPrimitive, type Key } from "react-aria-components";
import { Button } from "@tecton/react/components/button";
import { CommandGroup, CommandInput, CommandItem, CommandList } from "@tecton/react/components/command";
declare const appFinderIconVariants: (props?: ({
    tone?: "neutral" | "blue" | "azure" | "green" | "lime" | "yellow" | "saffron" | "red" | "pink" | "orchid" | "mauve" | "violet" | "lilac" | null | undefined;
    size?: "default" | "sm" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
type AppFinderTone = NonNullable<VariantProps<typeof appFinderIconVariants>["tone"]>;
/** The tinted code tile shared by the trigger and the items. */
declare function AppFinderIcon({ className, tone, size, ...props }: React.ComponentProps<"span"> & VariantProps<typeof appFinderIconVariants>): import("react/jsx-runtime").JSX.Element;
declare function AppFinder({ ...props }: React.ComponentProps<typeof DialogTriggerPrimitive>): import("react/jsx-runtime").JSX.Element;
type AppFinderTriggerProps = Omit<React.ComponentProps<typeof Button>, "children"> & {
    /** Short code (or glyph) of the current app, shown in the tile. */
    children?: React.ReactNode;
    /** Name of the current app; shown next to the tile from `sm` up. */
    name?: string;
    /** Colour of the tile; use the app's category tone. */
    tone?: AppFinderTone;
};
declare function AppFinderTrigger({ className, children, name, tone, "aria-label": ariaLabel, ...props }: AppFinderTriggerProps): import("react/jsx-runtime").JSX.Element;
type AppFinderMenuProps = Omit<React.ComponentProps<typeof PopoverPrimitive>, "children" | "className"> & {
    className?: string;
    /** `AppFinderInput`, `AppFinderList`, … */
    children: React.ReactNode;
    /** Accessible name of the palette. */
    "aria-label"?: string;
};
declare function AppFinderMenu({ className, children, placement, offset, "aria-label": ariaLabel, ...props }: AppFinderMenuProps): import("react/jsx-runtime").JSX.Element;
declare function AppFinderInput({ placeholder, ...props }: React.ComponentProps<typeof CommandInput>): import("react/jsx-runtime").JSX.Element;
type AppFinderListProps = Omit<React.ComponentProps<typeof CommandList>, "onAction" | "renderEmptyState"> & {
    /** Called with the `id` of the chosen app; the menu closes afterwards. */
    onAction?: (key: Key) => void;
    /** Shown when the search matches nothing. */
    emptyMessage?: React.ReactNode;
    /** Second line of the empty state. */
    emptyHint?: React.ReactNode;
};
declare function AppFinderList({ className, onAction, emptyMessage, emptyHint, ...props }: AppFinderListProps): import("react/jsx-runtime").JSX.Element;
type AppFinderGroupProps = React.ComponentProps<typeof CommandGroup> & {
    /**
     * Leave the group out while a query is typed: use it on "Recent" or
     * "Favourites" so apps don't show twice in the results.
     */
    hideWhileSearching?: boolean;
};
declare function AppFinderGroup({ className, hideWhileSearching, ...props }: AppFinderGroupProps): import("react/jsx-runtime").JSX.Element | null;
type AppFinderItemProps = Omit<React.ComponentProps<typeof CommandItem>, "children" | "textValue"> & {
    /** Leading glyph or short code of the app. */
    icon?: React.ReactNode;
    /** Colour of the tile; use the app's category tone. */
    tone?: AppFinderTone;
    /** Display name; also the `textValue` used by the filter. */
    name: string;
    description?: React.ReactNode;
    /** Extra words the filter should match (short code, aliases). */
    keywords?: string[];
    /** Marks the app the shell is currently showing. */
    isCurrent?: boolean;
};
declare function AppFinderItem({ className, icon, tone, name, description, keywords, isCurrent, ...props }: AppFinderItemProps): import("react/jsx-runtime").JSX.Element;
export { AppFinder, AppFinderTrigger, AppFinderMenu, AppFinderInput, AppFinderList, AppFinderGroup, AppFinderItem, AppFinderIcon, appFinderIconVariants, };
export type { AppFinderGroupProps, AppFinderItemProps, AppFinderListProps, AppFinderMenuProps, AppFinderTone, AppFinderTriggerProps, };
