// PATH: src/components/music/headphones-button.tsx
"use client"

import { Headphones } from "lucide-react"
import { useMusic } from "@/components/music/mini-player"
import { cn } from "@/lib/utils"

type Props = {
  className?: string
  compact?: boolean
}

export function HeadphonesButton({ className, compact = true }: Props) {
  const { openPlayer, state } = useMusic()

  const active =
    state.playing ||
    state.sessionActive ||
    (state.mode === "embed" && !!state.embed)

  return (
    <button
      type="button"
      onClick={() => openPlayer(state.tab || "moods")}
      aria-label={active ? "Music is playing — open player" : "Open study music"}
      className={cn(
        "relative rounded-full flex items-center justify-center transition-colors",
        compact ? "w-9 h-9 hover:bg-muted" : "gap-2 px-3 h-10 rounded-xl bg-muted",
        active && "bg-primary/10",
        className
      )}
    >
      <Headphones
        size={18}
        className={active ? "text-primary" : "text-gray-500"}
        strokeWidth={active ? 2.5 : 2}
      />
      {/* Pulse dot when something is playing in the background */}
      {active && (
        <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
        </span>
      )}
      {!compact && (
        <span className={cn("text-sm font-medium", active && "text-primary")}>
          Music
        </span>
      )}
    </button>
  )
}
