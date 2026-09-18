"use client"

import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import {
  ToggleButton as TogglePrimitive,
  type ToggleButtonProps,
} from "react-aria-components"

const toggleVariants = cva(
  "text-link-foreground hover:bg-ghost-hover hover:text-ghost-hover-foreground aria-pressed:bg-ghost-active aria-pressed:text-ghost-active-foreground data-hovered:bg-ghost-hover data-hovered:text-ghost-hover-foreground data-selected:bg-ghost-active data-selected:text-ghost-active-foreground group/toggle inline-flex items-center justify-center gap-1 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border-border-subtle border bg-transparent",
      },
      size: {
        default:
          "h-8 min-w-8 px-2 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        sm: "h-7 min-w-7 px-2 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: ToggleButtonProps & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
