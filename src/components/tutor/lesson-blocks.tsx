// PATH: src/components/tutor/lesson-blocks.tsx
"use client"

import { cn } from "@/lib/utils"
import { Markdown } from "@/components/markdown"
import { Loader2 } from "lucide-react"

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

export function EvaluationCard({ evaluation }: { evaluation: TutorEvaluation }) {
  const tone =
    evaluation.result === "correct"
      ? "border-green-200 bg-green-50 text-foreground dark:border-green-900 dark:bg-green-950/40"
      : evaluation.result === "partially_correct"
        ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
        : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40"

  const label =
    evaluation.result === "correct"
      ? "Correct"
      : evaluation.result === "partially_correct"
        ? "Partly correct"
        : "Not quite"

  return (
    <div className={cn("rounded-2xl border px-4 py-3 text-sm", tone)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 opacity-80">{label}</p>
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
  onAnswer,
}: {
  check: TutorCheck
  disabled?: boolean
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
          {check.options.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => onAnswer(check.questionId, o.text)}
              className="w-full text-left px-3 py-2.5 rounded-xl border border-border text-sm hover:border-primary/40 hover:bg-muted/50 disabled:opacity-50 transition-colors"
            >
              <span className="font-semibold text-primary mr-2 uppercase">{o.id}</span>
              {o.text}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500">Type your answer below and send.</p>
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

export function TutorTyping() {
  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-3 w-fit">
      <Loader2 size={18} className="animate-spin text-primary" />
    </div>
  )
}
