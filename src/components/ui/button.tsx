import { cn } from "@/lib/utils"
import { ButtonHTMLAttributes, forwardRef } from "react"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline"
  size?: "sm" | "md" | "lg"
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const variantClass =
      variant === "primary"
        ? "bg-primary text-white hover:bg-primary-hover"
        : variant === "secondary"
          ? "bg-muted text-foreground hover:bg-border"
          : variant === "ghost"
            ? "bg-transparent hover:bg-muted"
            : "border border-border bg-transparent hover:bg-muted"

    const sizeClass =
      size === "sm"
        ? "h-9 px-4 text-sm"
        : size === "lg"
          ? "h-12 px-6 text-base"
          : "h-11 px-5 text-base"

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:pointer-events-none",
          variantClass,
          sizeClass,
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
