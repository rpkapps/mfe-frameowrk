import * as React from "react";
import { type ToolbarProps as ToolbarPrimitiveProps } from "react-aria-components";
import { Separator } from "@tecton/react/components/separator";
/**
 * Tecton Overflow — a flex row that gives up space in stages when its
 * container gets narrower: elastic items shrink, labels collapse to icons,
 * then items move into a trailing "More" menu, lowest priority first
 * (`docs/OVERFLOW-RULES.md`). `Toolbar` is the same row on a React Aria
 * `Toolbar`; `Overflow` is the plain `div`.
 *
 * Only `OverflowItem`s leave the row; unwrapped children are fixed. Items,
 * dividers and spacers must be direct children of the row.
 *
 * Cost: one `ResizeObserver` per row, sizes cached per element, the visible
 * set kept in a store outside React. Each item subscribes to its own
 * visibility and the menu to the hidden list; nothing else re-renders, and a
 * pass that changes nothing notifies nobody.
 */
type Orientation = "horizontal" | "vertical";
type Labels = "auto" | "always" | "never";
type LabelBehavior = "collapse" | "keep";
type OverflowOptions = {
    /** Axis of the row. Default `horizontal`. */
    orientation?: Orientation;
    /** `auto` collapses labels before hiding items, `always` keeps them, `never` is icon-only from the start. */
    labels?: Labels;
    /** Keep at least this many items in the row regardless of width. */
    minimumVisible?: number;
    /** When fixed items alone do not fit: wrap the row (default) or scroll it. */
    lastResort?: "wrap" | "scroll";
    /** Render the trailing `OverflowMenu` automatically. Default `true`. */
    menu?: boolean;
};
type OverflowProps = React.ComponentProps<"div"> & OverflowOptions;
type ToolbarProps = Omit<ToolbarPrimitiveProps, "className" | "children" | "orientation"> & OverflowOptions & {
    className?: string;
    children?: React.ReactNode;
};
/** The plain `div` row. */
declare function Overflow(props: OverflowProps): import("react/jsx-runtime").JSX.Element;
/**
 * Tecton Toolbar — the row on a React Aria `Toolbar`: one tab stop, arrow
 * keys move between the visible controls. Give it an `aria-label`.
 */
declare function Toolbar(props: ToolbarProps): import("react/jsx-runtime").JSX.Element;
type OverflowItemProps = Omit<React.ComponentProps<"div">, "children"> & {
    /** Stable id, also the key of the menu item. */
    id: string;
    /** Higher stays in the row longer. Default `0`. */
    priority?: number;
    /** Text of the action: menu item label, tooltip, and accessible name when icon-only. */
    label?: string;
    /** Icon of the menu item. */
    icon?: React.ReactNode;
    /** Shortcut hint of the menu item. */
    shortcut?: React.ReactNode;
    /** Press handler; also injected into a React Aria `Button` child through `ButtonContext`. */
    onAction?: () => void;
    isDisabled?: boolean;
    variant?: "default" | "destructive";
    /** `collapse` (default when a label is given) drops the label to icon-only; `keep` never does. */
    labelBehavior?: LabelBehavior;
    /** Show the label as a tooltip while icon-only. Default: `labelBehavior === "collapse"`. */
    tooltip?: boolean;
    /** Elastic item: shrinks between these inline sizes before anything collapses. */
    elastic?: {
        min?: string;
        max?: string;
    } | boolean;
    /** The overflow form: a menu node, or `"never"` to keep the item fixed. Omitted builds a menu item from the props above. */
    overflow?: React.ReactNode | "never";
    children: React.ReactNode;
};
declare function OverflowItem({ id, priority, label, icon, shortcut, onAction, isDisabled, variant, labelBehavior, tooltip, elastic, overflow, className, style, children, ...props }: OverflowItemProps): import("react/jsx-runtime").JSX.Element;
/** The label text of an item. Visually hidden while icon-only, so the control keeps its accessible name. */
declare function OverflowLabel({ className, ...props }: React.ComponentProps<"span">): import("react/jsx-runtime").JSX.Element;
type OverflowGroupProps = {
    id: string;
    /** Section label in the menu. */
    label?: string;
    /** `together` moves the whole group when its lowest item would leave. */
    collapse?: "individually" | "together";
    children?: React.ReactNode;
};
declare function OverflowGroup({ id, label, collapse, children, }: OverflowGroupProps): import("react/jsx-runtime").JSX.Element;
/** A divider between items; hidden once nothing visible remains on one side of it. */
declare function OverflowDivider({ className, ...props }: Omit<React.ComponentProps<typeof Separator>, "orientation">): import("react/jsx-runtime").JSX.Element;
/** Zero-cost flexible space: what is before it sits at the start, what is after it at the end. */
declare function OverflowSpacer({ className, ...props }: React.ComponentProps<"div">): import("react/jsx-runtime").JSX.Element;
type OverflowMenuProps = {
    /** Accessible name of the default trigger. Default "More actions". */
    label?: string;
    /** A custom trigger button instead of the ellipsis. */
    trigger?: React.ReactNode;
    className?: string;
};
declare function OverflowMenu({ label, trigger, className, }: OverflowMenuProps): import("react/jsx-runtime").JSX.Element | null;
/** Whether the item with `id` is currently in the row. */
declare function useIsOverflowItemVisible(id: string): boolean;
export { Overflow, Toolbar, OverflowItem, OverflowLabel, OverflowGroup, OverflowDivider, OverflowSpacer, OverflowMenu, useIsOverflowItemVisible, };
export type { OverflowProps, ToolbarProps, OverflowItemProps, OverflowGroupProps, OverflowMenuProps, };
