import * as React from "react";
import { type BreadcrumbProps, type BreadcrumbsProps, type LinkProps } from "react-aria-components";
declare function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">): import("react/jsx-runtime").JSX.Element;
declare function BreadcrumbList<T extends object>({ className, ...props }: BreadcrumbsProps<T>): import("react/jsx-runtime").JSX.Element;
declare function BreadcrumbItem({ className, children, separatorClassName, ...props }: BreadcrumbProps & {
    separatorClassName?: string;
}): import("react/jsx-runtime").JSX.Element;
declare function BreadcrumbLink({ className, render, ...props }: LinkProps): import("react/jsx-runtime").JSX.Element;
declare function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">): import("react/jsx-runtime").JSX.Element;
declare function BreadcrumbEllipsis({ className, ...props }: React.ComponentProps<"span">): import("react/jsx-runtime").JSX.Element;
export { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbEllipsis, };
