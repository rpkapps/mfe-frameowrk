import * as React from "react";
import { type AutocompleteProps, type InputProps, type MenuItemProps, type MenuProps, type MenuSectionProps, type SeparatorProps } from "react-aria-components";
import { Dialog } from "@tecton/react/components/dialog";
declare function Command({ className, dir, style, ...props }: Omit<AutocompleteProps, "className" | "style"> & {
    className?: string;
    dir?: React.HTMLAttributes<HTMLDivElement>["dir"];
    style?: React.CSSProperties;
}): import("react/jsx-runtime").JSX.Element;
declare function CommandDialog({ title, description, children, open, onOpenChange, className, showCloseButton, ...props }: Omit<React.ComponentProps<typeof Dialog>, "children" | "className" | "isOpen" | "onOpenChange"> & {
    title?: string;
    description?: string;
    open?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
    className?: string;
    showCloseButton?: boolean;
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
declare function CommandInput({ className, ...props }: InputProps): import("react/jsx-runtime").JSX.Element;
declare function CommandList<T extends object>({ className, ...props }: MenuProps<T>): import("react/jsx-runtime").JSX.Element;
declare function CommandEmpty({ className, ...props }: React.ComponentProps<"div">): import("react/jsx-runtime").JSX.Element;
declare function CommandGroup<T extends object>({ className, children, items, heading, ...props }: MenuSectionProps<T> & {
    heading?: string;
}): import("react/jsx-runtime").JSX.Element;
declare function CommandSeparator({ className, ...props }: SeparatorProps): import("react/jsx-runtime").JSX.Element;
declare function CommandItem<T extends object>({ className, children, textValue, ...props }: MenuItemProps<T>): import("react/jsx-runtime").JSX.Element;
declare function CommandShortcut({ className, ...props }: React.ComponentProps<"span">): import("react/jsx-runtime").JSX.Element;
export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator, };
