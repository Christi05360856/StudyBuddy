// PATH: src/components/tutor/lesson-sidebar.tsx
"use client"

import { cn } from "@/lib/utils"
import { Check, Circle, List } from "lucide-react"

export type LessonLevel = "very_simple" | "standard" | "advanced" | "exam_ready"

const LEVELS: { id: LessonLevel; label: string }[] = [
  { id: "very_simple", label: "Very simple" },
  { id: "standard", label: "Standard" },
  { id: "advanced", label: "Advanced" },
  { id: "exam_ready", label: "Exam ready" },
]

export function LevelChips({
  level,
  onChange,
  disabled,
}: {
  level: LessonLevel
  onChange: (l: LessonLevel) => void
  disabled?: boolean
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {LEVELS.map((l) => (
        <button
          key={l.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(l.id)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50",
            level === l.id ? "bg-primary text-white" : "bg-muted text-gray-600 hover:text-foreground"
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

export function LessonProgressBar({
  current,
  total,
  stageLabel,
}: {
  current: number
  total: number
  stageLabel?: string
}) {
  const safeTotal = Math.max(total, 1)
  const pct = Math.min(100, Math.round((current / safeTotal) * 100))
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Lesson progress</span>
        <span className="tabular-nums font-medium text-foreground">
          {current} / {total}
          {stageLabel ? ` · ${stageLabel}` : ""}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function TopicOutline({
  topics,
  active,
  completed,
  onSelect,
  disabled,
}: {
  topics: string[]
  active: string | null
  completed: Set<string>
  onSelect: (topic: string) => void
  disabled?: boolean
}) {
  if (topics.length === 0) {
    return <p className="text-xs text-gray-500">No topics listed for this note yet.</p>
  }
  return (
    <ol className="space-y-1">
      {topics.map((topic, i) => {
        const done = completed.has(topic)
        const isActive = active === topic
        return (
          <li key={topic}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(topic)}
              className={cn(
                "w-full flex items-start gap-2.5 text-left px-2.5 py-2 rounded-xl text-sm transition-colors disabled:opacity-50",
                isActive
                  ? "bg-primary/10 text-foreground font-medium"
                  : "hover:bg-muted text-gray-600"
              )}
            >
              <span className="mt-0.5 shrink-0">
                {done ? (
                  <Check size={14} className="text-success" />
                ) : (
                  <Circle size={14} className={isActive ? "text-primary" : "text-gray-300"} />
                )}
              </span>
              <span className="min-w-0">
                <span className="text-[10px] text-gray-400 font-medium mr-1.5">{i + 1}</span>
                <span className="leading-snug">{topic}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export function OutlineToggleButton({
  open,
  onClick,
}: {
  open: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-medium",
        open ? "border-primary/40 bg-primary/5 text-primary" : "border-border bg-card text-gray-600"
      )}
      aria-expanded={open}
    >
      <List size={14} />
      Sections
    </button>
  )
}
