// PATH: src/components/tutor/lesson-sidebar.tsx
"use client"

import { useEffect } from "react"
import { cn } from "@/lib/utils"
import { Check, Circle, List, X } from "lucide-react"

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
      aria-haspopup="dialog"
    >
      <List size={14} />
      Sections
    </button>
  )
}

/**
 * Full-screen mobile overlay for lesson sections.
 * Backdrop click or X closes it.
 */
export function SectionsOverlay({
  open,
  onClose,
  materialLabel,
  level,
  onLevelChange,
  progressCurrent,
  progressTotal,
  stageLabel,
  topics,
  activeTopic,
  completedTopics,
  onSelectTopic,
  disabled,
}: {
  open: boolean
  onClose: () => void
  materialLabel: string
  level: LessonLevel
  onLevelChange: (l: LessonLevel) => void
  progressCurrent: number
  progressTotal: number
  stageLabel?: string
  topics: string[]
  activeTopic: string | null
  completedTopics: Set<string>
  onSelectTopic: (topic: string) => void
  disabled?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Lesson sections">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Close sections"
        onClick={onClose}
      />

      <div className="absolute inset-x-0 bottom-0 top-12 flex flex-col rounded-t-3xl bg-card shadow-2xl border-t border-border">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border shrink-0">
          <div className="min-w-0 pr-3">
            <p className="text-base font-semibold">Your lesson</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{materialLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 shrink-0 rounded-full bg-muted flex items-center justify-center"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 pb-10">
          <div>
            <p className="text-[11px] font-medium text-gray-500 mb-2">Teaching level</p>
            <LevelChips level={level} onChange={onLevelChange} disabled={disabled} />
          </div>

          <LessonProgressBar
            current={progressCurrent}
            total={progressTotal}
            stageLabel={stageLabel}
          />

          <div>
            <p className="text-[11px] font-medium text-gray-500 mb-2">Lesson outline</p>
            <TopicOutline
              topics={topics}
              active={activeTopic}
              completed={completedTopics}
              disabled={disabled}
              onSelect={(t) => {
                onSelectTopic(t)
                onClose()
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
