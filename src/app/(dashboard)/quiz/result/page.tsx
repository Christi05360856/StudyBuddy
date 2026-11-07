// PATH: src/app/(dashboard)/quiz/result/page.tsx
"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Check, Lightbulb, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BottomNav } from "@/components/bottom-nav"
import { cn } from "@/lib/utils"
import { BackButton } from "@/components/back-button"
import { createClient } from "@/lib/supabase/client"
import { LAST_RESULT_KEY, type LastResult, type ReviewItem } from "@/lib/quiz-review"

type Filter = "wrong" | "right" | "all"

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function ResultContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const attemptId = searchParams.get("attempt")
  const urlMaterial = searchParams.get("material") || ""
  const urlScore = Number(searchParams.get("score") || 0)
  const urlTotal = Number(searchParams.get("total") || 0)

  const [loading, setLoading] = useState(true)
  const [review, setReview] = useState<ReviewItem[]>([])
  const [score, setScore] = useState(urlScore)
  const [total, setTotal] = useState(urlTotal)
  const [seconds, setSeconds] = useState<number | null>(null)
  const [materialId, setMaterialId] = useState(urlMaterial)
  const [someMissing, setSomeMissing] = useState(false)
  const [filter, setFilter] = useState<Filter>("wrong")

  useEffect(() => {
    const load = async () => {
      // 1. The saved attempt (this is also what the Progress page opens)
      if (attemptId) {
        const { data: attempt } = await supabase
          .from("quiz_attempts")
          .select("material_id, total_questions, correct_count, time_taken_seconds, answers")
          .eq("id", attemptId)
          .single()

        if (attempt) {
          const picks = (attempt.answers ?? {}) as Record<string, number>
          const ids = Object.keys(picks)

          setScore(attempt.correct_count)
          setTotal(attempt.total_questions)
          setSeconds(attempt.time_taken_seconds)
          setMaterialId(attempt.material_id)

          if (ids.length > 0) {
            const { data: rows } = await supabase
              .from("questions")
              .select("id, question_text, options, correct_index, explanation, topic, page_reference")
              .in("id", ids)

            const found = new Map((rows ?? []).map((q) => [q.id, q]))
            const items: ReviewItem[] = []
            ids.forEach((id) => {
              const q = found.get(id)
              if (!q) return
              items.push({
                id,
                question_text: q.question_text,
                options: q.options as string[],
                correct_index: q.correct_index,
                picked: picks[id],
                explanation: q.explanation,
                topic: q.topic,
                page_reference: q.page_reference,
              })
            })
            setReview(items)
            // Questions are replaced when a note is processed again
            setSomeMissing(items.length < ids.length)
          } else {
            // Very old attempts did not keep the answers
            setSomeMissing(attempt.total_questions > 0)
          }
          setLoading(false)
          return
        }
      }

      // 2. The copy kept on this phone (used when the attempt could not be saved)
      try {
        const raw = sessionStorage.getItem(LAST_RESULT_KEY)
        if (raw) {
          const copy = JSON.parse(raw) as LastResult
          if (copy.total === urlTotal && copy.correct === urlScore) {
            setReview(copy.review)
            setSeconds(copy.seconds)
            if (copy.materialId) setMaterialId(copy.materialId)
          }
        }
      } catch {
        // nothing to show, the score alone is fine
      }
      setLoading(false)
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId])

  const percent = total > 0 ? Math.round((score / total) * 100) : 0

  const counts = useMemo(() => {
    const right = review.filter((r) => r.picked === r.correct_index).length
    const skipped = review.filter((r) => r.picked === -1).length
    return { right, skipped, wrong: review.length - right - skipped }
  }, [review])

  const missed = counts.wrong + counts.skipped

  const shown = review.filter((r) => {
    if (filter === "all") return true
    if (filter === "right") return r.picked === r.correct_index
    return r.picked !== r.correct_index
  })

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "wrong", label: "To fix", count: missed },
    { key: "right", label: "Correct", count: counts.right },
    { key: "all", label: "All", count: review.length },
  ]

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-5 pt-6">
        {/* Going "back" from a result would reopen the quiz, so this leads to Courses */}
        <BackButton onClick={() => router.push("/courses")} />
        <div className="text-center pt-4">
          <h1 className="text-2xl font-bold mb-8">
            {percent >= 70 ? "Nice work" : percent >= 50 ? "Good effort" : "Keep practising"}
          </h1>

          <div className="relative w-40 h-40 mx-auto mb-6">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" className="stroke-border" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                className="stroke-primary"
                strokeWidth="8"
                strokeDasharray={`${percent * 2.64} 264`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold">
                {score}/{total}
              </span>
            </div>
          </div>

          <p className="text-gray-500 mb-6">
            {percent}%{seconds !== null && ` · ${formatTime(seconds)}`}
          </p>
        </div>

        {review.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: "Correct", value: counts.right, color: "text-success" },
              { label: "Wrong", value: counts.wrong, color: "text-danger" },
              { label: "Skipped", value: counts.skipped, color: "text-gray-500" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-card border border-border p-3 text-center">
                <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 mb-10">
          {attemptId && materialId && missed > 0 && (
            <Button
              className="w-full"
              size="lg"
              onClick={() =>
                router.push(`/quiz?material=${materialId}&type=quick&retry=${attemptId}`)
              }
            >
              Practise my {missed} {missed === 1 ? "mistake" : "mistakes"}
            </Button>
          )}
          <Button
            variant={missed > 0 && attemptId ? "outline" : "primary"}
            className="w-full"
            size="lg"
            onClick={() => router.push("/courses")}
          >
            Back to courses
          </Button>
          <Button
            variant="outline"
            className="w-full"
            size="lg"
            onClick={() => router.push(materialId ? `/tutor?material=${materialId}` : "/tutor")}
          >
            Ask AI to explain
          </Button>
          <div className="text-center">
            <button onClick={() => router.push("/home")} className="text-sm text-gray-500 mt-2">
              Home
            </button>
          </div>
        </div>

        {/* Review of every question */}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="animate-spin text-primary" size={24} />
          </div>
        ) : review.length > 0 ? (
          <section>
            <h2 className="font-semibold mb-3">Review your answers</h2>

            <div className="flex gap-2 mb-4">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "flex-1 h-10 rounded-xl text-sm font-medium transition-colors",
                    filter === f.key ? "bg-primary text-white" : "bg-muted text-foreground"
                  )}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>

            {shown.length === 0 && (
              <p className="text-center text-gray-500 py-8">
                {filter === "wrong" ? "You got everything right. Well done!" : "Nothing to show here."}
              </p>
            )}

            <div className="space-y-4">
              {shown.map((r, index) => {
                const isRight = r.picked === r.correct_index
                const skipped = r.picked === -1
                return (
                  <div key={r.id} className="rounded-2xl bg-card border border-border p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-white",
                          isRight ? "bg-success" : "bg-danger"
                        )}
                      >
                        {isRight ? <Check size={14} /> : <X size={14} />}
                      </span>
                      <p className="font-medium leading-relaxed">
                        <span className="text-gray-400 mr-1">{index + 1}.</span>
                        {r.question_text}
                      </p>
                    </div>

                    <div className="space-y-2">
                      {r.options.map((opt, i) => {
                        const isCorrect = i === r.correct_index
                        const isPicked = i === r.picked
                        return (
                          <div
                            key={i}
                            className={cn(
                              "rounded-xl border-2 px-3 py-2.5 text-sm",
                              isCorrect
                                ? "border-success bg-success/10"
                                : isPicked
                                  ? "border-danger bg-danger/10"
                                  : "border-border"
                            )}
                          >
                            <span className="mr-2 text-gray-400">{String.fromCharCode(65 + i)}</span>
                            {opt}
                            {isCorrect && (
                              <span className="block text-xs font-medium text-success mt-1">
                                Correct answer
                              </span>
                            )}
                            {isPicked && !isCorrect && (
                              <span className="block text-xs font-medium text-danger mt-1">
                                Your answer
                              </span>
                            )}
                          </div>
                        )
                      })}
                      {skipped && (
                        <p className="text-xs font-medium text-gray-500">You skipped this question.</p>
                      )}
                    </div>

                    {r.explanation && (
                      <div className="flex items-start gap-2 rounded-xl bg-accent-soft px-3 py-2.5">
                        <Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-700" />
                        <p className="text-sm text-amber-900 leading-relaxed">{r.explanation}</p>
                      </div>
                    )}

                    {(r.topic || r.page_reference) && (
                      <p className="text-xs text-gray-400">
                        {[r.topic, r.page_reference].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {someMissing && (
              <p className="text-xs text-gray-400 text-center mt-4">
                Some questions are not shown because this note was processed again after the quiz.
              </p>
            )}
          </section>
        ) : (
          attemptId && (
            <p className="text-sm text-gray-400 text-center">
              The answer review is not available for this quiz.
            </p>
          )
        )}
      </div>

      <BottomNav />
    </div>
  )
}

export default function ResultPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      }
    >
      <ResultContent />
    </Suspense>
  )
}
