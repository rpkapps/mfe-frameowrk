"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import {
  Dialog as DialogPrimitive,
  DialogTrigger as DialogTriggerPrimitive,
  Popover as PopoverPrimitive,
  type Key,
} from "react-aria-components"
import { CheckIcon, ChevronDownIcon, SearchXIcon } from "lucide-react"

import { Button } from "@tecton/react/components/button"
import { usePortalTarget } from "@tecton/react/tecton/portal"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@tecton/react/components/command"

/**
 * Tecton AppFinder — the shell's application switcher. The trigger shows
 * the current app as a tinted code tile (plus its name from `sm` up) in
 * the top bar; the menu is a searchable, category-grouped list built on
 * `Command`, so it stays usable with a hundred registered
 * micro-frontends. Typing filters across every group and highlights the
 * match; `onAction` on `AppFinderList` receives the chosen app id and the
 * popover closes.
 */

const AppFinderContext = React.createContext<{
  close: () => void
  query: string
}>({ close: () => {}, query: "" })

const appFinderIconVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-md font-mono font-medium tracking-wide uppercase select-none [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-foreground",
        blue: "bg-blue-120 text-blue-830",
        azure: "bg-azure-120 text-azure-830",
        green: "bg-green-120 text-green-830",
        lime: "bg-lime-120 text-lime-830",
        yellow: "bg-yellow-120 text-yellow-1000",
        saffron: "bg-saffron-120 text-saffron-830",
        red: "bg-red-120 text-red-830",
        pink: "bg-pink-120 text-pink-830",
        orchid: "bg-orchid-120 text-orchid-830",
        mauve: "bg-mauve-120 text-mauve-830",
        violet: "bg-violet-120 text-violet-830",
        lilac: "bg-lilac-120 text-lilac-830",
      },
      size: {
        sm: "size-6 text-[10px]",
        default: "size-7 text-[11px]",
      },
    },
    defaultVariants: { tone: "neutral", size: "default" },
  }
)

type AppFinderTone = NonNullable<
  VariantProps<typeof appFinderIconVariants>["tone"]
>

/** The tinted code tile shared by the trigger and the items. */
function AppFinderIcon({
  className,
  tone,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof appFinderIconVariants>) {
  return (
    <span
      data-slot="app-finder-icon"
      className={cn(appFinderIconVariants({ tone, size }), className)}
      {...props}
    />
  )
}

function AppFinder({
  ...props
}: React.ComponentProps<typeof DialogTriggerPrimitive>) {
  return <DialogTriggerPrimitive data-slot="app-finder" {...props} />
}

type AppFinderTriggerProps = Omit<
  React.ComponentProps<typeof Button>,
  "children"
> & {
  /** Short code (or glyph) of the current app, shown in the tile. */
  children?: React.ReactNode
  /** Name of the current app; shown next to the tile from `sm` up. */
  name?: string
  /** Colour of the tile; use the app's category tone. */
  tone?: AppFinderTone
}

function AppFinderTrigger({
  className,
  children,
  name,
  tone,
  "aria-label": ariaLabel,
  ...props
}: AppFinderTriggerProps) {
  return (
    <Button
      data-slot="app-finder-trigger"
      variant="ghost"
      size="sm"
      aria-label={
        ariaLabel ?? (name ? `Switch application, current: ${name}` : undefined)
      }
      className={cn(
        "h-8 gap-1.5 rounded-lg pr-1.5 pl-1 font-medium",
        className
      )}
      {...props}
    >
      <AppFinderIcon tone={tone} size="sm">
        {children}
      </AppFinderIcon>
      {name ? (
        <span className="hidden max-w-40 truncate sm:inline">{name}</span>
      ) : null}
      <ChevronDownIcon
        data-icon="inline-end"
        className="size-3.5 text-muted-foreground"
      />
    </Button>
  )
}

type AppFinderMenuProps = Omit<
  React.ComponentProps<typeof PopoverPrimitive>,
  "children" | "className"
> & {
  className?: string
  /** `AppFinderInput`, `AppFinderList`, … */
  children: React.ReactNode
  /** Accessible name of the palette. */
  "aria-label"?: string
}

function AppFinderMenu({
  className,
  children,
  placement = "bottom start",
  offset = 6,
  "aria-label": ariaLabel = "Applications",
  ...props
}: AppFinderMenuProps) {
  const portalTarget = usePortalTarget()
  return (
    <PopoverPrimitive
      data-slot="app-finder-menu"
      placement={placement}
      offset={offset}
      className={cn(
        "z-50 w-[26rem] max-w-[calc(100vw-1rem)] origin-(--trigger-anchor-point) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95 data-[placement=bottom]:slide-in-from-top-2",
        className
      )}
      {...props}
      UNSTABLE_portalContainer={portalTarget}
    >
      <DialogPrimitive aria-label={ariaLabel} className="outline-none">
        {({ close }) => (
          <AppFinderPalette close={close}>{children}</AppFinderPalette>
        )}
      </DialogPrimitive>
    </PopoverPrimitive>
  )
}

/** Mounted with the dialog, so the query resets every time the menu opens. */
function AppFinderPalette({
  close,
  children,
}: {
  close: () => void
  children: React.ReactNode
}) {
  const [query, setQuery] = React.useState("")
  return (
    <AppFinderContext.Provider value={{ close, query }}>
      <Command
        className="rounded-lg!"
        inputValue={query}
        onInputChange={setQuery}
      >
        {children}
      </Command>
    </AppFinderContext.Provider>
  )
}

function AppFinderInput({
  placeholder = "Search applications…",
  ...props
}: React.ComponentProps<typeof CommandInput>) {
  return (
    <CommandInput
      data-slot="app-finder-input"
      placeholder={placeholder}
      {...props}
    />
  )
}

type AppFinderListProps = Omit<
  React.ComponentProps<typeof CommandList>,
  "onAction" | "renderEmptyState"
> & {
  /** Called with the `id` of the chosen app; the menu closes afterwards. */
  onAction?: (key: Key) => void
  /** Shown when the search matches nothing. */
  emptyMessage?: React.ReactNode
  /** Second line of the empty state. */
  emptyHint?: React.ReactNode
}

function AppFinderList({
  className,
  onAction,
  emptyMessage = "No applications match",
  emptyHint = "Try the app's short code or its category",
  ...props
}: AppFinderListProps) {
  const { close } = React.useContext(AppFinderContext)
  return (
    <CommandList
      data-slot="app-finder-list"
      className={cn("max-h-[min(24rem,60vh)]", className)}
      renderEmptyState={() => (
        <CommandEmpty className="flex flex-col items-center gap-1 py-8">
          <SearchXIcon className="mb-1 size-5 text-muted-foreground" />
          <span className="font-medium">{emptyMessage}</span>
          {emptyHint ? (
            <span className="text-xs text-muted-foreground">{emptyHint}</span>
          ) : null}
        </CommandEmpty>
      )}
      onAction={(key) => {
        onAction?.(key)
        close()
      }}
      {...props}
    />
  )
}

type AppFinderGroupProps = React.ComponentProps<typeof CommandGroup> & {
  /**
   * Leave the group out while a query is typed: use it on "Recent" or
   * "Favourites" so apps don't show twice in the results.
   */
  hideWhileSearching?: boolean
}

function AppFinderGroup({
  className,
  hideWhileSearching,
  ...props
}: AppFinderGroupProps) {
  const { query } = React.useContext(AppFinderContext)
  if (hideWhileSearching && query.trim()) return null
  return (
    <CommandGroup
      data-slot="app-finder-group"
      className={cn(
        "not-first:border-t not-first:border-border **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-heading]]:tracking-wide **:[[cmdk-group-heading]]:uppercase",
        className
      )}
      {...props}
    />
  )
}

type AppFinderItemProps = Omit<
  React.ComponentProps<typeof CommandItem>,
  "children" | "textValue"
> & {
  /** Leading glyph or short code of the app. */
  icon?: React.ReactNode
  /** Colour of the tile; use the app's category tone. */
  tone?: AppFinderTone
  /** Display name; also the `textValue` used by the filter. */
  name: string
  description?: React.ReactNode
  /** Extra words the filter should match (short code, aliases). */
  keywords?: string[]
  /** Marks the app the shell is currently showing. */
  isCurrent?: boolean
}

/** Wraps the first occurrence of `query` in `text` so it stands out. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim()
  if (!needle) return <>{text}</>
  const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase())
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-xs bg-primary/20 font-semibold text-inherit">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  )
}

function AppFinderItem({
  className,
  icon,
  tone,
  name,
  description,
  keywords,
  isCurrent,
  ...props
}: AppFinderItemProps) {
  const { query } = React.useContext(AppFinderContext)
  return (
    <CommandItem
      data-slot="app-finder-item"
      data-current={isCurrent || undefined}
      textValue={[name, ...(keywords ?? [])].join(" ")}
      className={cn(
        "items-center gap-2.5 rounded-md px-2 py-1.5 [&>svg:last-child]:hidden",
        className
      )}
      {...props}
    >
      {icon ? (
        <AppFinderIcon data-slot="app-finder-item-icon" tone={tone}>
          {typeof icon === "string" ? (
            <Highlight text={icon} query={query} />
          ) : (
            icon
          )}
        </AppFinderIcon>
      ) : null}
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate font-medium">
          <Highlight text={name} query={query} />
        </span>
        {description ? (
          <span className="truncate text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {isCurrent ? (
        <span
          data-slot="app-finder-item-current"
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
        >
          Current
          <CheckIcon className="size-4 text-primary" aria-hidden />
        </span>
      ) : null}
    </CommandItem>
  )
}

export {
  AppFinder,
  AppFinderTrigger,
  AppFinderMenu,
  AppFinderInput,
  AppFinderList,
  AppFinderGroup,
  AppFinderItem,
  AppFinderIcon,
  appFinderIconVariants,
}
export type {
  AppFinderGroupProps,
  AppFinderItemProps,
  AppFinderListProps,
  AppFinderMenuProps,
  AppFinderTone,
  AppFinderTriggerProps,
}
