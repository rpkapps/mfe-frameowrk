import * as React from "react"
import { cn } from "cn"

import { Overflow, type OverflowProps } from "@tecton/react/tecton/overflow"

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
function PageHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-6 gap-y-3",
        className
      )}
      {...props}
    />
  )
}

function PageHeaderContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-content"
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-1 [[data-slot=page-header]:has([data-slot=page-header-actions])>&]:max-w-3/5 [[data-slot=page-header]:has([data-slot=page-header-actions])>&]:flex-initial",
        className
      )}
      {...props}
    />
  )
}

function PageHeaderEyebrow({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-eyebrow"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function PageHeaderTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="page-header-title"
      className={cn(
        "truncate text-2xl leading-tight font-medium tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function PageHeaderDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-header-description"
      className={cn("max-w-prose text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/**
 * Section navigation. Between the title and the actions it keeps its natural
 * width; inside `PageHeaderActions`, wrapped in an `OverflowItem`, it moves
 * into the More menu as a whole when its priority is reached.
 */
function PageHeaderNav({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="page-header-nav"
      className={cn(
        "flex min-w-0 shrink-0 items-center self-center",
        className
      )}
      {...props}
    />
  )
}

/**
 * The header's overflow row: a plain `Overflow` rather than a toolbar, so a
 * tab list inside it keeps its own arrow-key navigation.
 */
function PageHeaderActions({ className, ...props }: OverflowProps) {
  return (
    <Overflow
      data-slot="page-header-actions"
      className={cn("min-w-0 flex-1 basis-0 justify-end", className)}
      {...props}
    />
  )
}

export {
  PageHeader,
  PageHeaderContent,
  PageHeaderEyebrow,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderNav,
  PageHeaderActions,
}
