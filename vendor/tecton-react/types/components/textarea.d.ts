import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { TextArea as TextareaPrimitive } from "react-aria-components";
declare const textareaVariants: (props?: ({
    variant?: "outline" | "text" | "filled" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
declare function Textarea({ className, variant, ...props }: React.ComponentProps<typeof TextareaPrimitive> & VariantProps<typeof textareaVariants>): import("react/jsx-runtime").JSX.Element;
export { Textarea, textareaVariants };
