"use client"

import * as React from "react"
import { cn } from "cn"
import { EllipsisVerticalIcon, SearchIcon } from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@tecton/react/components/avatar"
import { Button } from "@tecton/react/components/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@tecton/react/components/dropdown-menu"
import { Kbd } from "@tecton/react/components/kbd"
import { Tooltip, TooltipTrigger } from "@tecton/react/components/tooltip"
import { ShortcutKeys } from "@tecton/react/tecton/shortcuts"

/**
 * Tecton ShellActions — the global action cluster at the end of the shell
 * header: command palette trigger, icon actions (help, settings, release
 * notes, bug report) and the user menu. These are owned by the shell, not
 * by the mounted application.
 */
function ShellActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shell-actions"
      className={cn("ml-auto flex shrink-0 items-center gap-0.5", className)}
      {...props}
    />
  )
}

type ShellActionProps = React.ComponentProps<typeof Button> & {
  /** Accessible name, also shown as the tooltip. */
  label: string
  /**
   * Optional shortcut hint rendered in the tooltip, in `shortcuts` key
   * syntax (`"mod+k"`, `"?"`, `"g w"`).
   */
  shortcut?: string
}

function ShellAction({
  label,
  shortcut,
  className,
  children,
  ...props
}: ShellActionProps) {
  return (
    <TooltipTrigger>
      <Button
        data-slot="shell-action"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        className={cn("text-muted-foreground hover:text-foreground", className)}
        {...props}
      >
        {children}
      </Button>
      <Tooltip placement="bottom">
        {label}
        {shortcut ? <ShortcutKeys keys={shortcut} className="ms-1" /> : null}
      </Tooltip>
    </TooltipTrigger>
  )
}

type ShellCommandTriggerProps = Omit<
  React.ComponentProps<typeof Button>,
  "children"
> & {
  children?: React.ReactNode
  /** Shortcut hint shown at the end of the trigger. */
  shortcut?: React.ReactNode
}

/**
 * Command palette trigger: a search-styled field on `md` and up, an icon
 * button below it.
 */
function ShellCommandTrigger({
  className,
  children = "Search",
  shortcut = "⌘K",
  ...props
}: ShellCommandTriggerProps) {
  const label = typeof children === "string" ? children : "Search"
  return (
    <Button
      data-slot="shell-command-trigger"
      variant="outline"
      size="sm"
      aria-label={label}
      className={cn(
        "h-7 w-7 justify-center gap-2 border-transparent bg-transparent px-0 font-normal text-muted-foreground hover:text-foreground md:mr-1 md:w-40 md:justify-start md:border-border md:bg-muted/40 md:px-2 lg:w-56",
        className
      )}
      {...props}
    >
      <SearchIcon className="size-4 md:size-3.5" />
      <span className="hidden flex-1 truncate text-left md:inline">{children}</span>
      {shortcut ? (
        <Kbd className="pointer-events-none hidden lg:inline-flex">
          {shortcut}
        </Kbd>
      ) : null}
    </Button>
  )
}

function ShellDivider({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      data-slot="shell-divider"
      className={cn("mx-1 h-4 w-px bg-border", className)}
      {...props}
    />
  )
}

type ShellOverflowProps = Omit<
  React.ComponentProps<typeof DropdownMenuTrigger>,
  "children"
> & {
  /** Accessible name of the trigger (default "More"). */
  label?: string
  /** Menu contents (`DropdownMenuGroup`, `DropdownMenuItem`, …). */
  children: React.ReactNode
  className?: string
}

/**
 * Overflow menu for actions that do not fit a narrow header. Pair it with
 * responsive classes: hide the icon actions below a breakpoint and show
 * this menu instead.
 */
function ShellOverflow({
  label = "More",
  className,
  children,
  ...props
}: ShellOverflowProps) {
  return (
    <DropdownMenuTrigger data-slot="shell-overflow" {...props}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        className={cn("text-muted-foreground hover:text-foreground", className)}
      >
        <EllipsisVerticalIcon />
      </Button>
      <DropdownMenu placement="bottom end" className="min-w-48 rounded-lg">
        {children}
      </DropdownMenu>
    </DropdownMenuTrigger>
  )
}

type ShellUserMenuProps = Omit<
  React.ComponentProps<typeof DropdownMenuTrigger>,
  "children"
> & {
  user: { name: string; initials: string; image?: string }
  /** Menu contents (`DropdownMenuGroup`, `DropdownMenuItem`, …). */
  children: React.ReactNode
  className?: string
}

function ShellUserMenu({
  user,
  className,
  children,
  ...props
}: ShellUserMenuProps) {
  return (
    <DropdownMenuTrigger data-slot="shell-user-menu" {...props}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Account: ${user.name}`}
        className={cn("ml-1 rounded-full", className)}
      >
        <Avatar size="sm">
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback>{user.initials}</AvatarFallback>
        </Avatar>
      </Button>
      <DropdownMenu placement="bottom end" className="min-w-56 rounded-lg">
        {children}
      </DropdownMenu>
    </DropdownMenuTrigger>
  )
}

export {
  ShellActions,
  ShellAction,
  ShellCommandTrigger,
  ShellDivider,
  ShellOverflow,
  ShellUserMenu,
}
export type {
  ShellActionProps,
  ShellCommandTriggerProps,
  ShellOverflowProps,
  ShellUserMenuProps,
}
