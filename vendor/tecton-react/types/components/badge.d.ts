import { type VariantProps } from "class-variance-authority";
declare const badgeVariants: (props?: ({
    variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link" | "success" | "warning" | "info" | null | undefined;
    appearance?: "outline" | "solid" | null | undefined;
    size?: "default" | "lg" | "md" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
declare function Badge({ className, variant, appearance, size, render, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & {
    render?: (props: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}): string | number | bigint | boolean | import("react/jsx-runtime").JSX.Element | Iterable<import("react").ReactNode> | Promise<string | number | bigint | boolean | import("react").ReactPortal | import("react").ReactElement<unknown, string | import("react").JSXElementConstructor<any>> | Iterable<import("react").ReactNode> | null | undefined> | null | undefined;
export { Badge, badgeVariants };
