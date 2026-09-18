import * as React from "react";
import { Tooltip as TooltipPrimitive, TooltipTrigger as TooltipTriggerPrimitive } from "react-aria-components";
declare function TooltipTrigger({ delay, children, ...props }: React.ComponentProps<typeof TooltipTriggerPrimitive>): import("react/jsx-runtime").JSX.Element;
declare function Tooltip({ className, placement, offset, crossOffset, children, ...props }: Omit<React.ComponentProps<typeof TooltipPrimitive>, "children" | "className"> & {
    className?: string;
    children?: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export { Tooltip, TooltipTrigger };
