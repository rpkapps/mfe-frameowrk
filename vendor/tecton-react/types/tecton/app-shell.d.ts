import * as React from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@tecton/react/components/resizable";
/**
 * Tecton AppShell — the application frame: a solid top navigation bar,
 * an optional left rail/sidebar, the main work area and an optional right
 * aside for tool panels. Pure layout; combine with `Sidebar` for the
 * collapsible navigation or with `Panel` for the aside.
 */
declare function AppShell({ className, ...props }: React.ComponentProps<"div">): import("react/jsx-runtime").JSX.Element;
declare function AppShellHeader({ className, ...props }: React.ComponentProps<"header">): import("react/jsx-runtime").JSX.Element;
declare function AppShellBrand({ className, ...props }: React.ComponentProps<"div">): import("react/jsx-runtime").JSX.Element;
declare function AppShellNav({ className, ...props }: React.ComponentProps<"nav">): import("react/jsx-runtime").JSX.Element;
declare function AppShellHeaderActions({ className, ...props }: React.ComponentProps<"div">): import("react/jsx-runtime").JSX.Element;
declare function AppShellBody({ className, ...props }: React.ComponentProps<"div">): import("react/jsx-runtime").JSX.Element;
declare function AppShellSidebar({ className, ...props }: React.ComponentProps<"aside">): import("react/jsx-runtime").JSX.Element;
declare function AppShellMain({ className, ...props }: React.ComponentProps<"main">): import("react/jsx-runtime").JSX.Element;
declare function AppShellAside({ className, ...props }: React.ComponentProps<"aside">): import("react/jsx-runtime").JSX.Element;
/**
 * Resizable split inside the body: wrap the main area and a full-height
 * aside (or sidebar) in `AppShellSplit`, each in an `AppShellSplitPanel`,
 * with an `AppShellSplitHandle` between them. Sizes accept the
 * react-resizable-panels units (`"320px"`, `"25%"`, `"20rem"`).
 */
declare function AppShellSplit({ className, orientation, ...props }: React.ComponentProps<typeof ResizablePanelGroup>): import("react/jsx-runtime").JSX.Element;
declare function AppShellSplitPanel({ className, ...props }: React.ComponentProps<typeof ResizablePanel>): import("react/jsx-runtime").JSX.Element;
declare function AppShellSplitHandle({ className, ...props }: React.ComponentProps<typeof ResizableHandle>): import("react/jsx-runtime").JSX.Element;
/**
 * True once the viewport is at least `minWidth` pixels wide (false during
 * SSR). Use it to decide whether a full-height aside is rendered at all.
 */
declare function useMinWidth(minWidth: number): boolean;
export { AppShell, AppShellHeader, AppShellBrand, AppShellNav, AppShellHeaderActions, AppShellBody, AppShellSidebar, AppShellMain, AppShellAside, AppShellSplit, AppShellSplitPanel, AppShellSplitHandle, useMinWidth, };
