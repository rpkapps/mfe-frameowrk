import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import {
  Button as ButtonPrimitive,
  Link as LinkPrimitive,
  type ButtonProps as ButtonPrimitiveProps,
  type LinkProps as LinkPrimitiveProps,
} from "react-aria-components"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "hover:bg-primary-hover hover:text-primary-hover-foreground focus-visible:bg-primary-hover focus-visible:text-primary-hover-foreground data-pressed:bg-primary-pressed data-pressed:text-primary-pressed-foreground aria-expanded:bg-primary-active aria-expanded:text-primary-active-foreground bg-primary text-primary-foreground",
        outline:
          "border-outline-border text-outline-foreground hover:border-outline-hover-border hover:bg-outline-hover hover:text-outline-hover-foreground focus-visible:bg-outline-hover focus-visible:text-outline-hover-foreground data-pressed:border-outline-pressed-border data-pressed:bg-outline-pressed data-pressed:text-outline-pressed-foreground aria-expanded:border-outline-active-border aria-expanded:bg-outline-active aria-expanded:text-outline-active-foreground bg-transparent",
        secondary:
          "hover:bg-secondary-hover hover:text-secondary-hover-foreground focus-visible:bg-secondary-hover focus-visible:text-secondary-hover-foreground data-pressed:bg-secondary-pressed data-pressed:text-secondary-pressed-foreground aria-expanded:bg-secondary-active aria-expanded:text-secondary-active-foreground bg-secondary text-secondary-foreground",
        ghost:
          "text-ghost-foreground hover:bg-ghost-hover hover:text-ghost-hover-foreground focus-visible:bg-ghost-hover focus-visible:text-ghost-hover-foreground data-pressed:bg-ghost-pressed data-pressed:text-ghost-pressed-foreground aria-expanded:bg-ghost-active aria-expanded:text-ghost-active-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-link-foreground hover:text-link-hover-foreground data-pressed:text-link-pressed-foreground aria-expanded:text-link-active-foreground underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1 px-2 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),8px)] px-2 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),8px)] in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-md",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: Omit<ButtonPrimitiveProps, "className"> &
  React.RefAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    className?: string
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

function LinkButton({
  className,
  variant = "default",
  size = "default",
  ...props
}: Omit<LinkPrimitiveProps, "className"> &
  VariantProps<typeof buttonVariants> & {
    className?: string
  }) {
  return (
    <LinkPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, LinkButton, buttonVariants }
