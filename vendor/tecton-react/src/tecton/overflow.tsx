"use client"

import * as React from "react"
import { cn } from "cn"
import {
  ButtonContext,
  Toolbar as ToolbarPrimitive,
  type ToolbarProps as ToolbarPrimitiveProps,
} from "react-aria-components"
import { EllipsisIcon } from "lucide-react"

import { Button } from "@tecton/react/components/button"
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@tecton/react/components/dropdown-menu"
import { Separator } from "@tecton/react/components/separator"
import { Tooltip, TooltipTrigger } from "@tecton/react/components/tooltip"

/**
 * Tecton Overflow — a flex row that gives up space in stages when its
 * container gets narrower: elastic items shrink, labels collapse to icons,
 * then items move into a trailing "More" menu, lowest priority first
 * (`docs/OVERFLOW-RULES.md`). `Toolbar` is the same row on a React Aria
 * `Toolbar`; `Overflow` is the plain `div`.
 *
 * Only `OverflowItem`s leave the row; unwrapped children are fixed. Items,
 * dividers and spacers must be direct children of the row.
 *
 * Cost: one `ResizeObserver` per row, sizes cached per element, the visible
 * set kept in a store outside React. Each item subscribes to its own
 * visibility and the menu to the hidden list; nothing else re-renders, and a
 * pass that changes nothing notifies nobody.
 */

type Orientation = "horizontal" | "vertical"
type Labels = "auto" | "always" | "never"
type LabelBehavior = "collapse" | "keep"

type Item = {
  id: string
  element: HTMLElement
  priority: number
  groupId: string | null
  labelBehavior: LabelBehavior
  /** Sizes measured with the label shown / collapsed. */
  full: number | null
  compact: number | null
  /** The overflow form, read when the menu renders. */
  menu: React.RefObject<React.ReactNode>
}

type Group = { id: string; label?: string; together: boolean }

/** A direct child of the row, classified. */
type Entry =
  | { kind: "item"; item: Item }
  | { kind: "divider" | "spacer" | "fixed"; element: HTMLElement }

type ItemState = { visible: boolean; compact: boolean }
type MenuState = { hidden: string[]; version: number }

/** Size assumed for an icon-only control before it has been measured. */
const ICON_ONLY = 32

class OverflowStore {
  root: HTMLElement | null = null
  orientation: Orientation = "horizontal"
  labels: Labels = "auto"
  minimumVisible = 0
  private gap = 0
  private triggerSize: number | null = null
  private minSize = -1

  private items = new Map<string, Item>()
  private groups = new Map<string, Group>()
  private byElement = new WeakMap<Element, Item>()
  private dividers = new WeakSet<Element>()
  private sizes = new WeakMap<Element, number>()
  private observed = new WeakSet<Element>()
  private observer: ResizeObserver | null = null

  private hidden = new Set<string>()
  private compact = false
  private available = 0
  focusRequested = false

  private itemStates = new Map<string, ItemState>()
  private itemSubscribers = new Map<string, Set<() => void>>()
  menuState: MenuState = { hidden: [], version: 0 }
  /** Set by the menu while its popover is open. */
  menuOpen = false
  private menuSubscribers = new Set<() => void>()

  // ---- lifecycle -----------------------------------------------------------

  attach(root: HTMLElement) {
    this.root = root
    this.observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = (
          entry.target === root ? entry.contentBoxSize : entry.borderBoxSize
        )[0]
        const size = this.horizontal ? box.inlineSize : box.blockSize
        if (entry.target === root) this.available = size
        // Hidden children report 0; their cached size is kept.
        else if (size > 0) this.setSize(entry.target as HTMLElement, size)
      }
      this.compute()
    })
    this.observer.observe(root)
    const style = getComputedStyle(root)
    this.gap =
      Number.parseFloat(this.horizontal ? style.columnGap : style.rowGap) || 0
    // The rect is fractional; clientWidth rounds and can overstate by a pixel.
    const rect = root.getBoundingClientRect()
    const pad = (side: string) =>
      Number.parseFloat(style.getPropertyValue(`padding-${side}`)) || 0
    this.available = this.horizontal
      ? rect.width - pad("left") - pad("right")
      : rect.height - pad("top") - pad("bottom")
    // Re-attaching (StrictMode, a remount) starts expanded so that hidden
    // items become measurable again; the observer settles the rest.
    if (this.hidden.size > 0 || this.compact) this.apply(new Set(), false)
    this.syncChildren()
  }

  detach() {
    this.observer?.disconnect()
    this.observer = null
    this.observed = new WeakSet()
    this.root = null
  }

  /** Observe every direct child; measure the new ones synchronously. */
  syncChildren() {
    if (!this.root || !this.observer) return
    let changed = false
    for (const child of this.root.children) {
      if (this.observed.has(child)) continue
      this.observed.add(child)
      this.observer.observe(child)
      this.setSize(child as HTMLElement, this.rectSize(child))
      changed = true
    }
    if (changed) this.compute()
  }

  configure(orientation: Orientation, labels: Labels, minimumVisible: number) {
    if (
      orientation === this.orientation &&
      labels === this.labels &&
      minimumVisible === this.minimumVisible
    ) {
      return
    }
    this.orientation = orientation
    this.labels = labels
    this.minimumVisible = minimumVisible
    if (this.root) {
      const root = this.root
      this.detach()
      this.attach(root)
    }
  }

  // ---- registration --------------------------------------------------------

  registerItem(record: Omit<Item, "full" | "compact">) {
    const previous = this.items.get(record.id)
    const item: Item = {
      ...record,
      full: previous?.full ?? null,
      compact: previous?.compact ?? null,
    }
    this.items.set(record.id, item)
    this.byElement.set(record.element, item)
    const size = this.sizes.get(record.element)
    if (size) this.setSize(record.element, size)
    this.compute()
    return () => {
      if (this.items.get(record.id) === item) this.items.delete(record.id)
      this.byElement.delete(record.element)
      this.itemStates.delete(record.id)
      this.compute()
    }
  }

  registerGroup(group: Group) {
    this.groups.set(group.id, group)
    return () => {
      this.groups.delete(group.id)
    }
  }

  registerDivider(element: HTMLElement) {
    this.dividers.add(element)
    this.compute()
    return () => {
      this.dividers.delete(element)
      this.compute()
    }
  }

  /** The rendered menu trigger: its real size replaces the estimate. */
  registerTrigger(element: HTMLElement) {
    const size = this.rectSize(element)
    if (size > 0 && size !== this.triggerSize) {
      this.triggerSize = size
      this.compute()
    }
  }

  // ---- measurement ---------------------------------------------------------

  private get horizontal() {
    return this.orientation === "horizontal"
  }

  private rectSize(element: Element) {
    const rect = element.getBoundingClientRect()
    return this.horizontal ? rect.width : rect.height
  }

  /** Cache a child's size; for an item, bucket it by how it is rendered now. */
  private setSize(element: HTMLElement, size: number) {
    if (size <= 0) return
    this.sizes.set(element, size)
    const item = this.byElement.get(element)
    if (!item) return
    if (element.dataset.elastic !== undefined) {
      // An elastic item can always shrink to its minimum: that is its cost.
      const style = getComputedStyle(element)
      const min = Number.parseFloat(
        this.horizontal ? style.minWidth : style.minHeight
      )
      if (min > 0) size = Math.min(size, min)
    }
    if (element.dataset.compact !== undefined) item.compact = size
    else item.full = size
  }

  // ---- the pass ------------------------------------------------------------

  private entries(): Entry[] {
    const out: Entry[] = []
    for (const child of this.root?.children ?? []) {
      const element = child as HTMLElement
      const item = this.byElement.get(element)
      const slot = element.dataset.slot
      if (item) out.push({ kind: "item", item })
      else if (this.dividers.has(element))
        out.push({ kind: "divider", element })
      else if (slot === "overflow-spacer") out.push({ kind: "spacer", element })
      else if (slot !== "overflow-menu") out.push({ kind: "fixed", element })
    }
    return out
  }

  private itemSize(item: Item, compact: boolean) {
    if (compact && item.labelBehavior === "collapse") {
      return item.compact ?? Math.min(item.full ?? ICON_ONLY, ICON_ONLY)
    }
    return item.full ?? item.compact ?? 0
  }

  /**
   * Running total of the space the row needs. `hide` removes an item, and a
   * divider goes with it once nothing visible remains on one of its sides,
   * so the overflow loop stays linear in the number of items.
   */
  private tally(entries: Entry[], compact: boolean) {
    const size = (entry: Entry) =>
      entry.kind === "item"
        ? this.itemSize(entry.item, compact)
        : entry.kind === "spacer"
          ? 0
          : (this.sizes.get(entry.element) ?? 0)
    const visible = entries.map(() => true)
    const solid = (index: number) =>
      visible[index] &&
      entries[index].kind !== "divider" &&
      entries[index].kind !== "spacer"
    const dividers: number[] = []
    entries.forEach((entry, index) => {
      if (entry.kind === "divider" || entry.kind === "spacer")
        dividers.push(index)
    })
    // A divider or spacer shows only with something visible on both sides
    // of it; the More trigger at the end counts for the trailing side.
    const dividerShown = (index: number) =>
      entries.some((_, i) => i < index && solid(i)) &&
      (hiddenCount > 0 || entries.some((_, i) => i > index && solid(i)))
    let total = 0
    let count = 0
    let hiddenCount = 0
    const drop = (index: number) => {
      visible[index] = false
      total -= size(entries[index])
      count -= 1
    }
    for (const index of dividers) visible[index] = dividerShown(index)
    entries.forEach((entry, index) => {
      if (!visible[index]) return
      total += size(entry)
      count += 1
    })
    return {
      visible,
      need: () => {
        const trigger = hiddenCount > 0 ? (this.triggerSize ?? ICON_ONLY) : 0
        const slots = count + (hiddenCount > 0 ? 1 : 0)
        return total + trigger + Math.max(0, slots - 1) * this.gap
      },
      hide: (index: number) => {
        drop(index)
        hiddenCount += 1
        for (const divider of dividers) {
          if (visible[divider] && !dividerShown(divider)) drop(divider)
        }
      },
    }
  }

  compute() {
    if (!this.root) return
    const entries = this.entries()
    const items = entries.flatMap((e) => (e.kind === "item" ? [e.item] : []))
    const { available } = this

    // Stage 2: labels collapse when the full row does not fit and come back
    // only when every item fits again with its label.
    const compact =
      this.labels === "auto"
        ? this.tally(entries, false).need() > available
        : this.labels === "never"

    // Stage 3: overflow, lowest priority first, ties from the logical end.
    // An item with an open overlay is not hidden while it is open.
    const indexOf = new Map<Item, number>()
    entries.forEach((entry, index) => {
      if (entry.kind === "item") indexOf.set(entry.item, index)
    })
    const order = items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => a.item.priority - b.item.priority || b.index - a.index)
    const tally = this.tally(entries, compact)
    const hidden = new Set<string>()
    for (const { item } of order) {
      if (tally.need() <= available) break
      if (hidden.has(item.id)) continue
      if (items.length - hidden.size <= this.minimumVisible) break
      if (item.element.querySelector('[aria-expanded="true"]')) continue
      const together = item.groupId && this.groups.get(item.groupId)?.together
      for (const member of items) {
        if (hidden.has(member.id)) continue
        if (member === item || (together && member.groupId === item.groupId)) {
          hidden.add(member.id)
          tally.hide(indexOf.get(member) ?? -1)
        }
      }
    }

    this.apply(hidden, compact, entries)
    entries.forEach((entry, index) => {
      if (entry.kind === "divider" || entry.kind === "spacer") {
        entry.element.toggleAttribute("data-overflowing", !tally.visible[index])
      }
    })

    // Fixed items plus the trigger are the row's minimum size, written as an
    // inline style so a flex parent cannot squeeze the row below it.
    const fixed = entries.flatMap((e) =>
      e.kind === "fixed" ? [e.element] : []
    )
    let min = fixed.reduce((sum, el) => sum + (this.sizes.get(el) ?? 0), 0)
    let count = fixed.length
    if (items.length > 0) {
      min += this.triggerSize ?? ICON_ONLY
      count += 1
    }
    min = Math.ceil(min + Math.max(0, count - 1) * this.gap)
    if (min !== this.minSize) {
      this.minSize = min
      this.root.style[this.horizontal ? "minInlineSize" : "minBlockSize"] =
        min > 0 ? `${min}px` : ""
    }
  }

  private apply(
    hidden: Set<string>,
    compact: boolean,
    entries = this.entries()
  ) {
    const hiddenChanged =
      this.hidden.size !== hidden.size ||
      [...hidden].some((id) => !this.hidden.has(id))
    if (!hiddenChanged && compact === this.compact) return

    // Focus leaves with a hidden item and lands on the trigger.
    const active = document.activeElement
    for (const id of hidden) {
      if (
        !this.hidden.has(id) &&
        active &&
        this.items.get(id)?.element.contains(active)
      ) {
        this.focusRequested = true
      }
    }
    this.hidden = hidden
    this.compact = compact

    for (const item of this.items.values()) {
      const next: ItemState = {
        visible: !hidden.has(item.id),
        compact: compact && item.labelBehavior === "collapse",
      }
      const current = this.itemStates.get(item.id)
      if (current?.visible === next.visible && current.compact === next.compact)
        continue
      this.itemStates.set(item.id, next)
      this.itemSubscribers.get(item.id)?.forEach((cb) => cb())
    }

    if (hiddenChanged) {
      const ordered = entries.flatMap((e) =>
        e.kind === "item" && hidden.has(e.item.id) ? [e.item.id] : []
      )
      this.menuState = { hidden: ordered, version: this.menuState.version }
      this.menuSubscribers.forEach((cb) => cb())
    }
  }

  // ---- subscriptions -------------------------------------------------------

  itemState(id: string): ItemState {
    let state = this.itemStates.get(id)
    if (!state) {
      state = { visible: !this.hidden.has(id), compact: false }
      this.itemStates.set(id, state)
    }
    return state
  }

  subscribeItem(id: string, callback: () => void) {
    const set = this.itemSubscribers.get(id) ?? new Set()
    this.itemSubscribers.set(id, set)
    set.add(callback)
    return () => set.delete(callback)
  }

  subscribeMenu(callback: () => void) {
    this.menuSubscribers.add(callback)
    return () => this.menuSubscribers.delete(callback)
  }

  /**
   * A hidden item re-rendered: its menu form may have changed. Only an open
   * menu needs to know; a closed one reads every form afresh when it opens.
   */
  bumpMenu() {
    if (!this.menuOpen) return
    this.menuState = { ...this.menuState, version: this.menuState.version + 1 }
    this.menuSubscribers.forEach((cb) => cb())
  }

  /** Menu contents in source order: hidden items, grouped, with the dividers between them. */
  menuSections() {
    const sections: Array<
      | { key: string; groupId: string | null; group?: Group; items: Item[] }
      | { key: string; separator: true }
    > = []
    let pendingSeparator = false
    for (const entry of this.entries()) {
      if (entry.kind === "divider") {
        pendingSeparator = sections.length > 0
        continue
      }
      if (entry.kind !== "item") continue
      const item = entry.item
      if (!this.hidden.has(item.id)) {
        pendingSeparator = false
        continue
      }
      if (pendingSeparator) {
        sections.push({ key: `separator-${item.id}`, separator: true })
        pendingSeparator = false
      }
      const last = sections.at(-1)
      if (last && "items" in last && last.groupId === item.groupId) {
        last.items.push(item)
      } else {
        sections.push({
          key: item.id,
          groupId: item.groupId,
          group: item.groupId ? this.groups.get(item.groupId) : undefined,
          items: [item],
        })
      }
    }
    return sections
  }
}

// ---- contexts and roots --------------------------------------------------------

type RootContext = { store: OverflowStore; orientation: Orientation }
const OverflowContext = React.createContext<RootContext | null>(null)
const OverflowGroupContext = React.createContext<string | null>(null)
const OverflowItemContext = React.createContext(false) // compact

function useOverflow(component: string) {
  const value = React.useContext(OverflowContext)
  if (!value)
    throw new Error(`${component} must be inside <Overflow> or <Toolbar>.`)
  return value
}

type OverflowOptions = {
  /** Axis of the row. Default `horizontal`. */
  orientation?: Orientation
  /** `auto` collapses labels before hiding items, `always` keeps them, `never` is icon-only from the start. */
  labels?: Labels
  /** Keep at least this many items in the row regardless of width. */
  minimumVisible?: number
  /** When fixed items alone do not fit: wrap the row (default) or scroll it. */
  lastResort?: "wrap" | "scroll"
  /** Render the trailing `OverflowMenu` automatically. Default `true`. */
  menu?: boolean
}

type OverflowProps = React.ComponentProps<"div"> & OverflowOptions
type ToolbarProps = Omit<
  ToolbarPrimitiveProps,
  "className" | "children" | "orientation"
> &
  OverflowOptions & { className?: string; children?: React.ReactNode }

function OverflowRoot({
  as: Component,
  className,
  orientation = "horizontal",
  labels = "auto",
  minimumVisible = 0,
  lastResort = "wrap",
  menu = true,
  children,
  ...props
}: (OverflowProps | ToolbarProps) & { as: "div" | typeof ToolbarPrimitive }) {
  // One store per row. Recreated if hot reload replaced the class, so an old
  // instance is never driven by new code.
  const storeRef = React.useRef<OverflowStore>(null)
  if (!(storeRef.current instanceof OverflowStore)) {
    storeRef.current = new OverflowStore()
  }
  const store = storeRef.current
  const ref = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    store.configure(orientation, labels, minimumVisible)
  }, [store, orientation, labels, minimumVisible])
  React.useLayoutEffect(() => {
    if (ref.current) store.attach(ref.current)
    return () => store.detach()
  }, [store])
  // Children may have been added or removed: observe the new ones.
  React.useLayoutEffect(() => store.syncChildren())

  const context = React.useMemo(
    () => ({ store, orientation }),
    [store, orientation]
  )
  const vertical = orientation === "vertical"
  return (
    <OverflowContext.Provider value={context}>
      <Component
        ref={ref}
        data-slot={Component === "div" ? "overflow" : "toolbar"}
        data-overflow-root=""
        data-orientation={orientation}
        orientation={Component === "div" ? undefined : orientation}
        className={cn(
          "flex min-w-0 items-center gap-2",
          vertical && "min-h-0 flex-col items-stretch",
          // A column never wraps: that would open a second column.
          vertical
            ? "overflow-y-auto"
            : lastResort === "wrap"
              ? "flex-wrap"
              : "overflow-x-auto",
          className
        )}
        {...(props as object)}
      >
        {children}
        {menu ? <OverflowMenu /> : null}
      </Component>
    </OverflowContext.Provider>
  )
}

/** The plain `div` row. */
function Overflow(props: OverflowProps) {
  return <OverflowRoot as="div" {...props} />
}

/**
 * Tecton Toolbar — the row on a React Aria `Toolbar`: one tab stop, arrow
 * keys move between the visible controls. Give it an `aria-label`.
 */
function Toolbar(props: ToolbarProps) {
  return <OverflowRoot as={ToolbarPrimitive} {...props} />
}

// ---- item ----------------------------------------------------------------------

type OverflowItemProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** Stable id, also the key of the menu item. */
  id: string
  /** Higher stays in the row longer. Default `0`. */
  priority?: number
  /** Text of the action: menu item label, tooltip, and accessible name when icon-only. */
  label?: string
  /** Icon of the menu item. */
  icon?: React.ReactNode
  /** Shortcut hint of the menu item. */
  shortcut?: React.ReactNode
  /** Press handler; also injected into a React Aria `Button` child through `ButtonContext`. */
  onAction?: () => void
  isDisabled?: boolean
  variant?: "default" | "destructive"
  /** `collapse` (default when a label is given) drops the label to icon-only; `keep` never does. */
  labelBehavior?: LabelBehavior
  /** Show the label as a tooltip while icon-only. Default: `labelBehavior === "collapse"`. */
  tooltip?: boolean
  /** Elastic item: shrinks between these inline sizes before anything collapses. */
  elastic?: { min?: string; max?: string } | boolean
  /** The overflow form: a menu node, or `"never"` to keep the item fixed. Omitted builds a menu item from the props above. */
  overflow?: React.ReactNode | "never"
  children: React.ReactNode
}

function OverflowItem({
  id,
  priority = 0,
  label,
  icon,
  shortcut,
  onAction,
  isDisabled,
  variant = "default",
  labelBehavior = label ? "collapse" : "keep",
  tooltip = labelBehavior === "collapse",
  elastic,
  overflow,
  className,
  style,
  children,
  ...props
}: OverflowItemProps) {
  const { store } = useOverflow("OverflowItem")
  const groupId = React.useContext(OverflowGroupContext)
  const ref = React.useRef<HTMLDivElement>(null)
  const fixed = overflow === "never"

  // The menu form is read by the menu when it renders; a ref keeps it current
  // without re-registering the item on every render.
  const menu = React.useRef<React.ReactNode>(null)
  menu.current = fixed
    ? null
    : (overflow ?? (
        <DropdownMenuItem
          id={id}
          onAction={onAction}
          isDisabled={isDisabled}
          variant={variant}
          textValue={label}
        >
          {icon}
          {label}
          {shortcut ? (
            <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
          ) : null}
        </DropdownMenuItem>
      ))

  React.useLayoutEffect(() => {
    if (fixed || !ref.current) return
    return store.registerItem({
      id,
      element: ref.current,
      priority,
      groupId,
      labelBehavior,
      menu,
    })
  }, [store, id, priority, groupId, labelBehavior, fixed])

  const state = React.useSyncExternalStore(
    React.useCallback((cb) => store.subscribeItem(id, cb), [store, id]),
    () => store.itemState(id),
    () => store.itemState(id)
  )
  const visible = fixed || state.visible
  const compact = !fixed && state.compact

  // A hidden item re-rendered: the menu re-reads its overflow form.
  React.useLayoutEffect(() => {
    if (!visible) store.bumpMenu()
  })

  const buttonContext = React.useMemo(
    () =>
      onAction || isDisabled !== undefined
        ? { onPress: onAction, isDisabled }
        : null,
    [onAction, isDisabled]
  )

  let content = children
  if (tooltip && label) {
    content = (
      <TooltipTrigger isDisabled={!compact}>
        {content}
        <Tooltip>{label}</Tooltip>
      </TooltipTrigger>
    )
  }
  if (buttonContext) {
    content = (
      <ButtonContext.Provider value={buttonContext}>
        {content}
      </ButtonContext.Provider>
    )
  }

  return (
    <OverflowItemContext.Provider value={compact}>
      <div
        ref={ref}
        data-slot="overflow-item"
        data-overflowing={visible ? undefined : ""}
        data-compact={compact ? "" : undefined}
        data-elastic={elastic ? "" : undefined}
        className={cn(
          "flex shrink-0 items-center data-overflowing:hidden",
          elastic &&
            "max-w-(--overflow-max,100%) min-w-(--overflow-min,12rem) flex-1 shrink basis-0 [&>*]:w-full",
          className
        )}
        style={
          typeof elastic === "object"
            ? ({
                "--overflow-min": elastic.min,
                "--overflow-max": elastic.max,
                ...style,
              } as React.CSSProperties)
            : style
        }
        {...props}
      >
        {content}
      </div>
    </OverflowItemContext.Provider>
  )
}

/** The label text of an item. Visually hidden while icon-only, so the control keeps its accessible name. */
function OverflowLabel({ className, ...props }: React.ComponentProps<"span">) {
  const compact = React.useContext(OverflowItemContext)
  return (
    <span
      data-slot="overflow-label"
      className={cn(compact && "sr-only", className)}
      {...props}
    />
  )
}

// ---- group, divider, spacer ------------------------------------------------------

type OverflowGroupProps = {
  id: string
  /** Section label in the menu. */
  label?: string
  /** `together` moves the whole group when its lowest item would leave. */
  collapse?: "individually" | "together"
  children?: React.ReactNode
}

function OverflowGroup({
  id,
  label,
  collapse = "individually",
  children,
}: OverflowGroupProps) {
  const { store } = useOverflow("OverflowGroup")
  React.useLayoutEffect(
    () => store.registerGroup({ id, label, together: collapse === "together" }),
    [store, id, label, collapse]
  )
  return (
    <OverflowGroupContext.Provider value={id}>
      {children}
    </OverflowGroupContext.Provider>
  )
}

/** A divider between items; hidden once nothing visible remains on one side of it. */
function OverflowDivider({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Separator>, "orientation">) {
  const { store, orientation } = useOverflow("OverflowDivider")
  const ref = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(
    () => (ref.current ? store.registerDivider(ref.current) : undefined),
    [store]
  )
  return (
    <Separator
      ref={ref}
      data-slot="overflow-divider"
      orientation={orientation === "vertical" ? "horizontal" : "vertical"}
      className={cn(
        orientation === "vertical"
          ? "w-4 self-center"
          : "h-4 aria-[orientation=vertical]:self-center",
        "data-overflowing:hidden",
        className
      )}
      {...props}
    />
  )
}

/** Zero-cost flexible space: what is before it sits at the start, what is after it at the end. */
function OverflowSpacer({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="overflow-spacer"
      aria-hidden
      className={cn(
        "min-w-0 flex-1 basis-0 data-overflowing:hidden",
        className
      )}
      {...props}
    />
  )
}

// ---- menu ----------------------------------------------------------------------

type OverflowMenuProps = {
  /** Accessible name of the default trigger. Default "More actions". */
  label?: string
  /** A custom trigger button instead of the ellipsis. */
  trigger?: React.ReactNode
  className?: string
}

function OverflowMenu({
  label = "More actions",
  trigger,
  className,
}: OverflowMenuProps) {
  const { store, orientation } = useOverflow("OverflowMenu")
  const state = React.useSyncExternalStore(
    React.useCallback((cb) => store.subscribeMenu(cb), [store]),
    () => store.menuState,
    () => store.menuState
  )
  const ref = React.useRef<HTMLDivElement>(null)
  const open = state.hidden.length > 0

  React.useLayoutEffect(() => {
    if (!open || !ref.current) return
    store.registerTrigger(ref.current)
    if (store.focusRequested) {
      store.focusRequested = false
      ref.current.querySelector<HTMLElement>("button")?.focus()
    }
  }, [store, open, state])

  if (!open) return null

  return (
    <div
      ref={ref}
      data-slot="overflow-menu"
      className={cn("flex shrink-0 items-center", className)}
    >
      <DropdownMenuTrigger
        onOpenChange={(isOpen) => {
          store.menuOpen = isOpen
        }}
      >
        {trigger ?? (
          <Button variant="ghost" size="icon" aria-label={label}>
            <EllipsisIcon />
          </Button>
        )}
        <DropdownMenu
          placement={orientation === "vertical" ? "end top" : "bottom end"}
          className="w-auto min-w-40"
        >
          {/* Mounted only while open, so the forms are read fresh each time. */}
          <OverflowMenuContents store={store} />
        </DropdownMenu>
      </DropdownMenuTrigger>
    </div>
  )
}

function OverflowMenuContents({ store }: { store: OverflowStore }) {
  return store.menuSections().map((section) =>
    "separator" in section ? (
      <DropdownMenuSeparator key={section.key} />
    ) : section.group ? (
      <DropdownMenuGroup key={section.key}>
        {section.group.label ? (
          <DropdownMenuLabel>{section.group.label}</DropdownMenuLabel>
        ) : null}
        {section.items.map((item) => (
          <React.Fragment key={item.id}>{item.menu.current}</React.Fragment>
        ))}
      </DropdownMenuGroup>
    ) : (
      section.items.map((item) => (
        <React.Fragment key={item.id}>{item.menu.current}</React.Fragment>
      ))
    )
  )
}

/** Whether the item with `id` is currently in the row. */
function useIsOverflowItemVisible(id: string) {
  const { store } = useOverflow("useIsOverflowItemVisible")
  return React.useSyncExternalStore(
    React.useCallback((cb) => store.subscribeItem(id, cb), [store, id]),
    () => store.itemState(id).visible,
    () => true
  )
}

export {
  Overflow,
  Toolbar,
  OverflowItem,
  OverflowLabel,
  OverflowGroup,
  OverflowDivider,
  OverflowSpacer,
  OverflowMenu,
  useIsOverflowItemVisible,
}
export type {
  OverflowProps,
  ToolbarProps,
  OverflowItemProps,
  OverflowGroupProps,
  OverflowMenuProps,
}
