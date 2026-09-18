import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { Input as InputPrimitive } from "react-aria-components";
declare const inputVariants: (props?: ({
    variant?: "outline" | "text" | "filled" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
declare function Input({ className, type, variant, ...props }: React.ComponentProps<typeof InputPrimitive> & VariantProps<typeof inputVariants>): import("react/jsx-runtime").JSX.Element;
export { Input, inputVariants };
