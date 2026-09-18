import { type VariantProps } from "class-variance-authority";
import { Separator as SeparatorPrimitive } from "react-aria-components";
declare const separatorVariants: (props?: ({
    emphasis?: "default" | "strong" | "subtle" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
declare function Separator({ className, orientation, emphasis, ...props }: React.ComponentProps<typeof SeparatorPrimitive> & VariantProps<typeof separatorVariants>): import("react/jsx-runtime").JSX.Element;
export { Separator, separatorVariants };
