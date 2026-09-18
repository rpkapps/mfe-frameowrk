import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[size=default]:h-5 data-[size=default]:px-2 data-[size=default]:py-0.5 data-[size=default]:text-xs data-[size=default]:has-data-[icon=inline-end]:pr-1.5 data-[size=default]:has-data-[icon=inline-start]:pl-1.5 data-[size=lg]:h-7 data-[size=lg]:px-2.5 data-[size=lg]:text-sm data-[size=lg]:has-data-[icon=inline-end]:pr-2 data-[size=lg]:has-data-[icon=inline-start]:pl-2 data-[size=md]:h-6 data-[size=md]:px-2 data-[size=md]:text-xs data-[size=md]:has-data-[icon=inline-end]:pr-1.5 data-[size=md]:has-data-[icon=inline-start]:pl-1.5 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none data-[size=default]:[&>svg]:size-3! data-[size=lg]:[&>svg]:size-4! data-[size=md]:[&>svg]:size-3.5!",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground data-[appearance=outline]:border-primary data-[appearance=outline]:bg-transparent data-[appearance=outline]:text-foreground [a]:hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_12%)] data-[appearance=outline]:[a]:hover:bg-primary/15",
        secondary:
          "bg-secondary text-secondary-foreground data-[appearance=outline]:border-border data-[appearance=outline]:bg-transparent data-[appearance=outline]:text-foreground [a]:hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_8%)] data-[appearance=outline]:[a]:hover:bg-accent",
        destructive:
          "bg-destructive-surface text-destructive-surface-foreground [a]:hover:bg-destructive-surface/80 focus-visible:ring-destructive/40 data-[appearance=outline]:border-destructive data-[appearance=outline]:bg-transparent data-[appearance=outline]:text-destructive data-[appearance=outline]:[a]:hover:bg-destructive/10",
        outline:
          "border-border text-foreground [a]:hover:bg-accent [a]:hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        success:
          "bg-success-surface text-success-surface-foreground [a]:hover:bg-success-surface/80 data-[appearance=outline]:border-success data-[appearance=outline]:text-success data-[appearance=outline]:[a]:hover:bg-success/10 data-[appearance=outline]:bg-transparent",
        warning:
          "bg-warning-surface text-warning-surface-foreground [a]:hover:bg-warning-surface/80 data-[appearance=outline]:border-warning data-[appearance=outline]:text-warning data-[appearance=outline]:[a]:hover:bg-warning/10 data-[appearance=outline]:bg-transparent",
        info: "bg-info-surface text-info-surface-foreground [a]:hover:bg-info-surface/80 data-[appearance=outline]:border-info data-[appearance=outline]:text-info data-[appearance=outline]:[a]:hover:bg-info/10 data-[appearance=outline]:bg-transparent",
      },
      appearance: {
        solid: "",
        outline: "",
      },
      size: {
        default: "",
        md: "",
        lg: "",
      },
    },
    defaultVariants: {
      variant: "default",
      appearance: "solid",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  appearance = "solid",
  size = "default",
  render,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    render?: (props: React.HTMLAttributes<HTMLElement>) => React.ReactNode
  }) {
  if (render) {
    const renderProps = {
      "data-slot": "badge",
      "data-variant": variant,
      "data-appearance": appearance,
      "data-size": size,
      className: cn(badgeVariants({ variant, appearance, size }), className),
      ...props,
    }

    return render(renderProps)
  }

  return (
    <span
      data-slot="badge"
      data-variant={variant}
      data-appearance={appearance}
      data-size={size}
      className={cn(badgeVariants({ variant, appearance, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
