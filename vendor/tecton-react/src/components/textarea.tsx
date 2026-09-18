import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import {
  composeRenderProps,
  TextArea as TextareaPrimitive,
} from "react-aria-components"

const textareaVariants = cva(
  "hover:border-input-hover flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-base transition-[color,box-shadow] outline-none placeholder:text-muted-foreground autofill:[-webkit-background-clip:text] autofill:[-webkit-text-fill-color:var(--foreground)] autofill:[transition:background-color_0s_600000s,color_0s_600000s] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        outline: "bg-transparent",
        filled:
          "rounded-b-none border-x-0 border-t-0 border-b-border bg-muted autofill:shadow-[inset_0_0_0_1000px_var(--muted)] autofill:[-webkit-background-clip:border-box] hover:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_4%)] focus-visible:border-ring focus-visible:ring-0 aria-invalid:bg-destructive/20 aria-invalid:ring-0 dark:bg-muted dark:hover:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_4%)] dark:aria-invalid:border-destructive",
        text: "rounded-none border-x-0 border-t-0 border-b-border bg-transparent px-0 hover:border-b-foreground/60 focus-visible:border-ring focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent dark:hover:bg-transparent",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  }
)

function Textarea({
  className,
  variant = "outline",
  ...props
}: React.ComponentProps<typeof TextareaPrimitive> &
  VariantProps<typeof textareaVariants>) {
  return (
    <TextareaPrimitive
      data-slot="textarea"
      data-variant={variant}
      className={composeRenderProps(className, (className) =>
        cn(textareaVariants({ variant }), className)
      )}
      {...props}
    />
  )
}

export { Textarea, textareaVariants }
