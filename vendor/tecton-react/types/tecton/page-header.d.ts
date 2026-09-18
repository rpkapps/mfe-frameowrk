import * as React from "react";
import { type OverflowProps } from "@tecton/react/tecton/overflow";
/**
 * Tecton PageHeader — page title block with optional eyebrow (breadcrumb),
 * description, section tabs and trailing actions. `PageHeaderActions` is one
 * overflow row: wrap the section tabs and the secondary actions in
 * `OverflowItem`s with priorities, put an `OverflowSpacer` between them,
 * and they move into the More menu lowest priority first when the header
 * gets narrow (`docs/OVERFLOW-RULES.md`). The title keeps its natural width
 * up to 60% of the header; the row gets the rest. The header is a single
 * row at every width: the actions collapse, so it never needs to stack.
 */
declare function PageHeader({ className, ...props }: React.ComponentProps<"header">): import("react/jsx-runtime").JSX.Element;
declare function PageHeaderContent({ className, ...props }: React.ComponentProps<"div">): import("react/jsx-runtime").JSX.Element;
declare function PageHeaderEyebrow({ className, ...props }: React.ComponentProps<"div">): import("react/jsx-runtime").JSX.Element;
declare function PageHeaderTitle({ className, ...props }: React.ComponentProps<"h1">): import("react/jsx-runtime").JSX.Element;
declare function PageHeaderDescription({ className, ...props }: React.ComponentProps<"p">): import("react/jsx-runtime").JSX.Element;
/**
 * Section navigation. Between the title and the actions it keeps its natural
 * width; inside `PageHeaderActions`, wrapped in an `OverflowItem`, it moves
 * into the More menu as a whole when its priority is reached.
 */
declare function PageHeaderNav({ className, ...props }: React.ComponentProps<"nav">): import("react/jsx-runtime").JSX.Element;
/**
 * The header's overflow row: a plain `Overflow` rather than a toolbar, so a
 * tab list inside it keeps its own arrow-key navigation.
 */
declare function PageHeaderActions({ className, ...props }: OverflowProps): import("react/jsx-runtime").JSX.Element;
export { PageHeader, PageHeaderContent, PageHeaderEyebrow, PageHeaderTitle, PageHeaderDescription, PageHeaderNav, PageHeaderActions, };
