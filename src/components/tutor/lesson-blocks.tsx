// PATH: src/components/tutor/lesson-blocks.tsx
"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Markdown } from "@/components/markdown"

export type CheckOption = { id: string; text: string }

export type TutorCheck = {
  questionId: string
  prompt: string
  answerType: "single_choice" | "short_text"
  options?: CheckOption[]
}

export type TutorEvaluation = {
  result: string
  feedback: string
  misconception?: { detected: boolean; label?: string; explanation?: string }
}

export type ThinkingMode =
  | "start_lesson"
  | "student_message"
  | "submit_answer"
  | "request_hint"
  | "request_reexplanation"
  | "recap"
  | "default"

const THINKING_BY_MODE: Record<ThinkingMode, { emoji: string; text: string }[]> = {
  start_lesson: [
    { emoji: "📚", text: "Preparing your lesson…" },
    { emoji: "🧩", text: "Organising the key ideas…" },
    { emoji: "✨", text: "Shaping a clear explanation…" },
    { emoji: "✍️", text: "Writing it up for you…" },
  ],
  student_message: [
    { emoji: "🧠", text: "Thinking through your question…" },
    { emoji: "🔍", text: "Checking the details…" },
    { emoji: "💡", text: "Putting the answer together…" },
  ],
  submit_answer: [
    { emoji: "✅", text: "Checking your answer…" },
    { emoji: "🔎", text: "Evaluating your understanding…" },
    { emoji: "📝", text: "Preparing feedback…" },
  ],
  request_hint: [
    { emoji: "💡", text: "Working out a useful hint…" },
    { emoji: "🧭", text: "Finding a gentle nudge…" },
  ],
  request_reexplanation: [
    { emoji: "🔄", text: "Finding a clearer explanation…" },
    { emoji: "✨", text: "Trying a different angle…" },
  ],
  recap: [
    { emoji: "📋", text: "Preparing your recap…" },
    { emoji: "🧩", text: "Pulling the key points together…" },
  ],
  default: [
    { emoji: "🧠", text: "Thinking…" },
    { emoji: "✨", text: "Working on it…" },
  ],
}

export function EvaluationCard({ evaluation }: { evaluation: TutorEvaluation }) {
  const tone =
    evaluation.result === "correct"
      ? "border-green-300 bg-green-50 text-foreground dark:border-green-800 dark:bg-green-950/40"
      : evaluation.result === "partially_correct"
        ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
        : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40"

  const label =
    evaluation.result === "correct"
      ? "Correct"
      : evaluation.result === "partially_correct"
        ? "Partly correct"
        : "Incorrect"

  return (
    <div className={cn("rounded-2xl border px-4 py-3 text-sm", tone)} role="status">
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="leading-relaxed">{evaluation.feedback}</p>
      {evaluation.misconception?.detected && evaluation.misconception.explanation && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
          {evaluation.misconception.label ? (
            <span className="font-medium">{evaluation.misconception.label}: </span>
          ) : null}
          {evaluation.misconception.explanation}
        </p>
      )}
    </div>
  )
}

export function UnderstandingCheckCard({
  check,
  disabled,
  locked,
  selectedText,
  onAnswer,
}: {
  check: TutorCheck
  disabled?: boolean
  locked?: boolean
  selectedText?: string | null
  onAnswer: (questionId: string, text: string) => void
}) {
  return (
    <div className="rounded-2xl border border-primary/25 bg-card px-4 py-4 space-y-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
        Check your understanding
      </p>
      <p className="text-sm font-medium leading-relaxed">{check.prompt}</p>
      {check.options && check.options.length > 0 ? (
        <div className="space-y-2">
          {check.options.map((o) => {
            const isSelected = locked && selectedText === o.text
            return (
              <button
                key={o.id}
                type="button"
                disabled={disabled || locked}
                onClick={() => onAnswer(check.questionId, o.text)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors disabled:opacity-70",
                  isSelected
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-border hover:border-primary/40 hover:bg-muted/50"
                )}
              >
                <span className="font-semibold text-primary mr-2 uppercase">{o.id}</span>
                {o.text}
              </button>
            )
          })}
        </div>
      ) : locked && selectedText ? (
        <p className="text-sm text-gray-600">Your answer: {selectedText}</p>
      ) : (
        <p className="text-xs text-gray-500">Type your answer below and send.</p>
      )}
      {locked && (
        <p className="text-[11px] text-gray-500">Answer submitted</p>
      )}
    </div>
  )
}

export function TutorBubble({
  role,
  content,
}: {
  role: "user" | "assistant"
  content: string
}) {
  return (
    <div
      className={cn(
        "max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed",
        role === "user"
          ? "ml-auto bg-primary text-white whitespace-pre-wrap"
          : "bg-card border border-border"
      )}
    >
      {role === "user" ? content : <Markdown text={content} />}
    </div>
  )
}

export function TutorThinking({ mode = "default" }: { mode?: ThinkingMode }) {
  const lines = THINKING_BY_MODE[mode] || THINKING_BY_MODE.default
  const [i, setI] = useState(0)

  useEffect(() => {
    setI(0)
    const id = window.setInterval(() => {
      setI((n) => (n + 1) % lines.length)
    }, 2200)
    return () => window.clearInterval(id)
  }, [mode, lines.length])

  const line = lines[i % lines.length]

  return (
    <div
      className="w-fit max-w-[min(100%,22rem)] rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"
      role="status"
      aria-live="polite"
      aria-label={line.text}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-lg leading-none animate-pulse" aria-hidden>
          {line.emoji}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{line.text}</p>
          <div className="mt-1.5 flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function TutorTyping() {
  return <TutorThinking mode="default" />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} />
}

export function TopicListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}

export function CourseFolderSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  )
}
