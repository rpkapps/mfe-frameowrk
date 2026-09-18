import * as React from "react";
declare function Avatar({ className, size, ...props }: React.ComponentProps<"div"> & {
    size?: "default" | "sm" | "lg";
}): import("react/jsx-runtime").JSX.Element;
declare function AvatarImage({ className, ...props }: React.ComponentProps<"img">): import("react/jsx-runtime").JSX.Element;
declare function AvatarFallback({ className, ...props }: React.ComponentProps<"div">): import("react/jsx-runtime").JSX.Element;
declare function AvatarBadge({ className, ...props }: React.ComponentProps<"span">): import("react/jsx-runtime").JSX.Element;
declare function AvatarGroup({ className, ...props }: React.ComponentProps<"div">): import("react/jsx-runtime").JSX.Element;
declare function AvatarGroupCount({ className, ...props }: React.ComponentProps<"div">): import("react/jsx-runtime").JSX.Element;
export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge, };
