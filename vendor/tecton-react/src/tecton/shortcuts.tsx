"use client"

import * as React from "react"
import { cn } from "cn"

import { Kbd, KbdGroup } from "@tecton/react/components/kbd"

/**
 * Tecton Shortcuts — a keyboard shortcut registry for the micro-frontend
 * shell. The host creates one registry and listens for keys once; the
 * mounted applications register their own shortcuts against it (from React
 * with `useShortcut`, or from anywhere with `registry.register`) and get
 * them listed in the shell's help and command palette.
 *
 * Key syntax: chords are `+`-separated (`mod+k`, `shift+?`, `alt+enter`),
 * sequences are space-separated (`g w`). `mod` is ⌘ on macOS and Ctrl
 * elsewhere.
 */
type Shortcut = {
  /** Stable id; registering the same id again replaces the earlier one. */
  id: string
  /** Key chord or sequence, e.g. `"mod+k"`, `"?"`, `"g w"`. */
  keys: string
  /** Shown in shortcut lists. */
  label: string
  /** Heading the shortcut is listed under (default "General"). */
  group?: string
  onAction: (event: KeyboardEvent) => void
  /**
   * Fire while typing in an input, textarea or editable element. Defaults
   * to true for chords with Ctrl / ⌘ / Alt and false otherwise.
   */
  allowInInput?: boolean
  /** Skip the shortcut (and let the key through) when this returns false. */
  isEnabled?: () => boolean
  /** Keep the shortcut out of lists. */
  hidden?: boolean
}

type Chord = {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  /** Shift may or may not be held for symbol keys such as `?`. */
  looseShift: boolean
}

type ShortcutRegistry = {
  /** Registers one or more shortcuts; returns a function that removes them. */
  register: (shortcut: Shortcut | Shortcut[]) => () => void
  unregister: (id: string) => void
  /** Registered shortcuts, in registration order. */
  getAll: () => Shortcut[]
  subscribe: (listener: () => void) => () => void
  /** Dispatches a key event; returns true when a shortcut handled it. */
  handleKeyDown: (event: KeyboardEvent) => boolean
}

const SEQUENCE_TIMEOUT = 1000

const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  return: "enter",
  space: " ",
  spacebar: " ",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  del: "delete",
  plus: "+",
}

function isMacPlatform() {
  if (typeof navigator === "undefined") return false
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)
}

function parseChord(source: string, isMac: boolean): Chord {
  const parts = source.split("+").filter(Boolean)
  const chord: Chord = {
    key: "",
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    looseShift: false,
  }
  for (const raw of parts) {
    const part = raw.toLowerCase()
    if (part === "mod") {
      if (isMac) chord.meta = true
      else chord.ctrl = true
    } else if (part === "ctrl" || part === "control") chord.ctrl = true
    else if (part === "alt" || part === "option") chord.alt = true
    else if (part === "shift") chord.shift = true
    else if (part === "meta" || part === "cmd" || part === "command") chord.meta = true
    else chord.key = KEY_ALIASES[part] ?? part
  }
  if (source.endsWith("+") && !chord.key) chord.key = "+"
  // A single non-alphanumeric key ("?", "/", ".") is typed with or without
  // shift depending on the layout, so shift is not required to match.
  chord.looseShift = chord.key.length === 1 && !/[a-z0-9]/i.test(chord.key)
  return chord
}

function parseKeys(keys: string, isMac: boolean): Chord[] {
  return keys.trim().split(/\s+/).filter(Boolean).map((chord) => parseChord(chord, isMac))
}

function chordFromEvent(event: KeyboardEvent): Chord {
  return {
    key: event.key.toLowerCase(),
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    looseShift: false,
  }
}

function chordMatches(expected: Chord, actual: Chord) {
  return (
    expected.key === actual.key &&
    expected.ctrl === actual.ctrl &&
    expected.alt === actual.alt &&
    expected.meta === actual.meta &&
    (expected.looseShift || expected.shift === actual.shift)
  )
}

function hasModifier(chord: Chord) {
  return chord.ctrl || chord.alt || chord.meta
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

/** Creates a registry. The host owns it and hands it to the mounted applications. */
function createShortcutRegistry(): ShortcutRegistry {
  const shortcuts = new Map<string, Shortcut>()
  const listeners = new Set<() => void>()
  let snapshot: Shortcut[] = []
  let pending: Chord[] = []
  let pendingAt = 0
  const isMac = isMacPlatform()

  const notify = () => {
    snapshot = [...shortcuts.values()]
    listeners.forEach((listener) => listener())
  }

  const register = (input: Shortcut | Shortcut[]) => {
    const list = Array.isArray(input) ? input : [input]
    for (const shortcut of list) {
      // Re-insert so the latest registration takes precedence.
      shortcuts.delete(shortcut.id)
      shortcuts.set(shortcut.id, shortcut)
    }
    notify()
    return () => {
      for (const shortcut of list) {
        if (shortcuts.get(shortcut.id) === shortcut) shortcuts.delete(shortcut.id)
      }
      notify()
    }
  }

  const unregister = (id: string) => {
    if (shortcuts.delete(id)) notify()
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return false
    const key = event.key.toLowerCase()
    if (["shift", "control", "alt", "meta"].includes(key)) return false

    const chord = chordFromEvent(event)
    const now = Date.now()
    if (now - pendingAt > SEQUENCE_TIMEOUT) pending = []
    pending.push(chord)
    pendingAt = now

    const editable = isEditableTarget(event.target)
    const candidates = [...shortcuts.values()].reverse()

    const attempt = (buffer: Chord[]) => {
      let prefix = false
      for (const shortcut of candidates) {
        const sequence = parseKeys(shortcut.keys, isMac)
        if (sequence.length < buffer.length) continue
        const matches = buffer.every((entry, index) => chordMatches(sequence[index], entry))
        if (!matches) continue
        const allowed = shortcut.allowInInput ?? sequence.every(hasModifier)
        if (editable && !allowed) continue
        if (shortcut.isEnabled && !shortcut.isEnabled()) continue
        if (sequence.length === buffer.length) {
          event.preventDefault()
          pending = []
          shortcut.onAction(event)
          return "handled" as const
        }
        prefix = true
      }
      return prefix ? ("pending" as const) : ("none" as const)
    }

    let result = attempt(pending)
    if (result === "none" && pending.length > 1) {
      pending = [chord]
      result = attempt(pending)
    }
    if (result === "pending") {
      event.preventDefault()
      return true
    }
    if (result === "none") pending = []
    return result === "handled"
  }

  return {
    register,
    unregister,
    getAll: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    handleKeyDown,
  }
}

const ShortcutsContext = React.createContext<ShortcutRegistry | null>(null)

type ShortcutsProviderProps = {
  /** A registry created with `createShortcutRegistry`; one is created when omitted. */
  registry?: ShortcutRegistry
  /** Element that receives the key events (default: `document`). */
  target?: HTMLElement | Document | null
  children: React.ReactNode
}

/**
 * Listens for key events once and makes the registry available to the tree.
 * Nested providers without a `registry` of their own reuse the parent's, so
 * a component can wrap itself in one and still share the host's registry.
 */
function ShortcutsProvider({ registry, target, children }: ShortcutsProviderProps) {
  const parent = React.useContext(ShortcutsContext)
  const [fallback] = React.useState(createShortcutRegistry)
  const value = registry ?? parent ?? fallback

  React.useEffect(() => {
    // The parent provider already listens for this registry.
    if (value === parent) return
    const node = target === undefined ? document : target
    if (!node) return
    const onKeyDown = (event: Event) => {
      value.handleKeyDown(event as KeyboardEvent)
    }
    node.addEventListener("keydown", onKeyDown)
    return () => node.removeEventListener("keydown", onKeyDown)
  }, [value, parent, target])

  return <ShortcutsContext.Provider value={value}>{children}</ShortcutsContext.Provider>
}

/** The registry of the nearest `ShortcutsProvider`. */
function useShortcutRegistry() {
  const registry = React.useContext(ShortcutsContext)
  if (!registry) {
    throw new Error("useShortcutRegistry must be used within a ShortcutsProvider")
  }
  return registry
}

/** The registered shortcuts, re-rendering as applications register and unregister. */
function useShortcuts() {
  const registry = useShortcutRegistry()
  return React.useSyncExternalStore(registry.subscribe, registry.getAll, registry.getAll)
}

/**
 * Registers a shortcut for the lifetime of the component. The handler
 * always sees the latest render, so it needs no dependency list.
 */
function useShortcut(shortcut: Omit<Shortcut, "onAction"> & { onAction: Shortcut["onAction"] }) {
  const registry = useShortcutRegistry()
  const onAction = React.useRef(shortcut.onAction)
  const isEnabled = React.useRef(shortcut.isEnabled)
  onAction.current = shortcut.onAction
  isEnabled.current = shortcut.isEnabled

  const { id, keys, label, group, allowInInput, hidden } = shortcut
  React.useEffect(
    () =>
      registry.register({
        id,
        keys,
        label,
        group,
        allowInInput,
        hidden,
        onAction: (event) => onAction.current(event),
        isEnabled: () => isEnabled.current?.() ?? true,
      }),
    [registry, id, keys, label, group, allowInInput, hidden]
  )
}

const KEY_LABELS: Record<string, string> = {
  escape: "Esc",
  enter: "↵",
  backspace: "⌫",
  delete: "Del",
  tab: "⇥",
  " ": "Space",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
}

/** Display labels for a shortcut: one array of key caps per chord. */
function formatShortcut(keys: string, isMac = isMacPlatform()): string[][] {
  return parseKeys(keys, isMac).map((chord) => {
    const caps: string[] = []
    if (chord.ctrl) caps.push(isMac ? "⌃" : "Ctrl")
    if (chord.alt) caps.push(isMac ? "⌥" : "Alt")
    if (chord.shift) caps.push(isMac ? "⇧" : "Shift")
    if (chord.meta) caps.push(isMac ? "⌘" : "Win")
    if (chord.key) caps.push(KEY_LABELS[chord.key] ?? chord.key.toUpperCase())
    return caps
  })
}

const subscribeNoop = () => () => {}

/**
 * Renders a shortcut as key caps (`Kbd`) joined with "+" (`Ctrl + K`,
 * `G + W`); the accessible name spells a sequence out ("G, then W").
 */
function ShortcutKeys({
  keys,
  className,
  ...props
}: React.ComponentProps<"span"> & { keys: string }) {
  const isMac = React.useSyncExternalStore(subscribeNoop, isMacPlatform, () => false)
  const chords = formatShortcut(keys, isMac)
  const caps = chords.flat()
  const spoken = chords.map((chord) => chord.join(" + ")).join(", then ")
  return (
    <span
      data-slot="shortcut-keys"
      aria-label={spoken}
      className={cn("inline-flex items-center", className)}
      {...props}
    >
      <KbdGroup aria-hidden className="gap-1">
        {caps.map((cap, index) => (
          <React.Fragment key={`${index}-${cap}`}>
            {index > 0 && <span className="text-xs text-muted-foreground">+</span>}
            <Kbd>{cap}</Kbd>
          </React.Fragment>
        ))}
      </KbdGroup>
    </span>
  )
}

export {
  createShortcutRegistry,
  ShortcutsProvider,
  useShortcutRegistry,
  useShortcuts,
  useShortcut,
  formatShortcut,
  ShortcutKeys,
}
export type { Shortcut, ShortcutRegistry, ShortcutsProviderProps }
