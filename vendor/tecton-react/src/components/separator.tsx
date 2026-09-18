import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Separator as SeparatorPrimitive } from "react-aria-components"

const separatorVariants = cva(
  "block shrink-0 border-0 aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=vertical]:w-px aria-[orientation=vertical]:self-stretch [:is(hr)]:h-px [:is(hr)]:w-full",
  {
    variants: {
      emphasis: {
        subtle: "bg-border-subtle",
        default: "bg-border",
        strong: "bg-border-strong",
      },
    },
    defaultVariants: {
      emphasis: "default",
    },
  }
)

function Separator({
  className,
  orientation = "horizontal",
  emphasis = "default",
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive> &
  VariantProps<typeof separatorVariants>) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      data-emphasis={emphasis}
      orientation={orientation}
      className={cn(separatorVariants({ emphasis }), className)}
      {...props}
    />
  )
}

export { Separator, separatorVariants }
