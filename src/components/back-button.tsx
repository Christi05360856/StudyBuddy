// PATH: src/components/back-button.tsx
"use client"

// One back arrow for the whole app.
// router.back() does nothing when the app was opened straight on this page (home-screen icon,
// shared link, page refresh). In that case we go to a sensible page instead of staying stuck.
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

export function BackButton({
  fallback = "/home",
  className,
  onClick,
}: {
  fallback?: string
  className?: string
  /** Use this when the arrow should do something special (for example finish a topic first). */
  onClick?: () => void
}) {
  const router = useRouter()

  const goBack = () => {
    if (onClick) return onClick()
    if (typeof window !== "undefined" && window.history.length > 1) router.back()
    else router.push(fallback)
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Go back"
      className={cn("p-2 -ml-2 rounded-full hover:bg-muted shrink-0", className)}
    >
      <ArrowLeft size={20} />
    </button>
  )
}
