// PATH: src/app/(dashboard)/quiz/page.tsx
"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Flag, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { LAST_RESULT_KEY, type LastResult, type ReviewItem } from "@/lib/quiz-review"

type Question = {
  id: string
  question_text: string
  options: string[]
  correct_index: number
  page_reference: string | null
  explanation: string | null
  topic: string | null
}

function QuizContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const materialId = searchParams.get("material")
  const type = searchParams.get("type") || "test"
  // When set, the quiz only uses the questions the student got wrong or skipped in that attempt
  const retryAttemptId = searchParams.get("retry")

  const requestedCount = type === "exam" ? 50 : 30
  const baseTimeLimit = type === "exam" ? 600 : 480 // seconds

  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)
  // question id -> the option the student picked. An answer is saved the moment it is tapped.
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [timeLimit, setTimeLimit] = useState(baseTimeLimit)
  const [timeLeft, setTimeLeft] = useState(baseTimeLimit)
  const [finished, setFinished] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    const loadQuestions = async () => {
      if (!materialId) {
        setLoading(false)
        return
      }

      const columns = "id, question_text, options, correct_index, page_reference, explanation, topic"

      // "Practice my mistakes": only the questions missed in an earlier attempt
      if (retryAttemptId) {
        const { data: attempt } = await supabase
          .from("quiz_attempts")
          .select("answers")
          .eq("id", retryAttemptId)
          .single()

        const earlier = (attempt?.answers ?? {}) as Record<string, number>
        const ids = Object.keys(earlier)

        if (ids.length > 0) {
          const { data: asked } = await supabase.from("questions").select(columns).in("id", ids)
          const missed = (asked ?? []).filter((q) => earlier[q.id] !== q.correct_index)

          if (missed.length > 0) {
            const mixed = [...missed].sort(() => Math.random() - 0.5)
            // One minute per question, and never less than two minutes
            const limit = Math.max(120, mixed.length * 60)
            setTimeLimit(limit)
            setTimeLeft(limit)
            setQuestions(mixed)
            setLoading(false)
            return
          }
        }
        // Nothing to practise (or the questions were replaced): fall through to a normal quiz
      }

      const { data, error } = await supabase.from("questions").select(columns).eq("material_id", materialId)

      if (error || !data || data.length === 0) {
        setQuestions([])
        setLoading(false)
        return
      }

      // Shuffle and take up to requestedCount (edge case: fewer available)
      const shuffled = [...data].sort(() => Math.random() - 0.5)
      setQuestions(shuffled.slice(0, Math.min(requestedCount, shuffled.length)))
      setLoading(false)
    }

    loadQuestions()
  }, [materialId, requestedCount, retryAttemptId])

  // Marks the quiz, saves the attempt, then shows the result.
  // It always reads the latest answers, including the one just tapped on the last question.
  const handleFinish = useCallback(async () => {
    if (finished) return
    setFinished(true)
    setConfirmFinish(false)

    // Every question is saved, skipped ones as -1, so the review can show them later
    const fullAnswers: Record<string, number> = {}
    let correct = 0
    questions.forEach((q) => {
      const picked = answers[q.id] ?? -1
      fullAnswers[q.id] = picked
      if (picked === q.correct_index) correct++
    })

    const seconds = timeLimit - timeLeft

    const {
      data: { user },
    } = await supabase.auth.getUser()

    let attemptId: string | null = null
    if (user && materialId) {
      // If saving fails the student still sees their score and review
      const { data: saved } = await supabase
        .from("quiz_attempts")
        .insert({
          user_id: user.id,
          material_id: materialId,
          type,
          total_questions: questions.length,
          correct_count: correct,
          time_taken_seconds: seconds,
          answers: fullAnswers,
        })
        .select("id")
        .single()
      attemptId = saved?.id ?? null

      // Count this finished quiz toward the study streak (Lagos day)
      try {
        await supabase.rpc("record_study_day")
      } catch {
        // non-fatal – streak just will not update this time
      }
    }

    // Keep a copy on the phone in case the saved attempt cannot be opened
    try {
      const review: ReviewItem[] = questions.map((q) => ({
        id: q.id,
        question_text: q.question_text,
        options: q.options,
        correct_index: q.correct_index,
        picked: fullAnswers[q.id],
        explanation: q.explanation,
        topic: q.topic,
        page_reference: q.page_reference,
      }))
      const copy: LastResult = {
        materialId: materialId || "",
        total: questions.length,
        correct,
        seconds,
        review,
      }
      sessionStorage.setItem(LAST_RESULT_KEY, JSON.stringify(copy))
    } catch {
      // storage blocked, the review simply will not be available offline
    }

    const query = new URLSearchParams({
      score: String(correct),
      total: String(questions.length),
      material: materialId || "",
    })
    if (attemptId) query.set("attempt", attemptId)
    router.push(`/quiz/result?${query.toString()}`)
  }, [finished, questions, answers, materialId, type, timeLimit, timeLeft, router, supabase])

  // Timer: counts down once a second
  useEffect(() => {
    if (finished || loading || questions.length === 0) return
    const t = setInterval(() => setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [finished, loading, questions.length])

  // When the time reaches zero, finish the quiz
  useEffect(() => {
    if (timeLeft === 0 && !finished && !loading && questions.length > 0) {
      handleFinish()
    }
  }, [timeLeft, finished, loading, questions.length, handleFinish])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5">
        <p className="text-gray-500 text-center">No questions available for this material yet.</p>
        <Button onClick={() => router.back()}>Go back</Button>
      </div>
    )
  }

  const q = questions[current]
  const selected = answers[q.id] ?? null
  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const actualTotal = questions.length

  const choose = (idx: number) => {
    setAnswers((prev) => ({ ...prev, [q.id]: idx }))
  }

  const unanswered = questions.filter((item) => answers[item.id] === undefined).length

  const goNext = () => {
    if (current + 1 >= actualTotal) {
      // Ask first if some questions were left blank
      if (unanswered > 0) setConfirmFinish(true)
      else handleFinish()
    } else {
      setCurrent((c) => c + 1)
    }
  }

  const goBack = () => {
    if (current === 0) return
    setCurrent((c) => c - 1)
  }

  const toggleFlag = () => {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(q.id)) next.delete(q.id)
      else next.add(q.id)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-5 pt-6 pb-4 border-b border-border">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500 capitalize">{type}</p>
            <div className="flex items-center gap-1.5 text-sm font-medium bg-muted px-3 py-1 rounded-full">
              <span className={cn(timeLeft < 60 && "text-danger")}>
                {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
              </span>
            </div>
          </div>
          <p className="text-sm font-medium mb-2">
            Question {current + 1} of {actualTotal}
          </p>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${((current + 1) / actualTotal) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 py-6 max-w-lg mx-auto w-full">
        <div className="bg-card rounded-2xl border border-border p-5 mb-6">
          <p className="text-lg font-medium leading-relaxed mb-3">{q.question_text}</p>
          {q.page_reference && (
            <span className="inline-flex items-center gap-1 text-xs bg-accent-soft text-amber-800 px-2.5 py-1 rounded-full">
              📄 {q.page_reference}
            </span>
          )}
        </div>

        <div className="space-y-3">
          {(q.options || []).map((opt, idx) => (
            <button
              key={idx}
              onClick={() => choose(idx)}
              className={cn(
                "w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all font-medium",
                selected === idx
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card hover:border-gray-300"
              )}
            >
              <span className="mr-2 text-gray-400">{String.fromCharCode(65 + idx)}</span>
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4 border-t border-border bg-card safe-area-pb">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={toggleFlag}
            aria-label="Flag this question"
            className={cn(
              "p-3 rounded-xl border",
              flagged.has(q.id) ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border text-gray-400"
            )}
          >
            <Flag size={18} />
          </button>
          <Button variant="outline" onClick={goBack} disabled={current === 0} className="flex-1">
            Back
          </Button>
          <Button onClick={goNext} disabled={finished} className="flex-1">
            {current + 1 >= actualTotal ? "Finish" : "Next"}
          </Button>
        </div>
      </div>

      {confirmFinish && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Finish the quiz?</h2>
            <p className="text-sm text-gray-500">
              You have {unanswered} unanswered {unanswered === 1 ? "question" : "questions"}. They
              will count as wrong.
            </p>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmFinish(false)}>
                Keep going
              </Button>
              <Button className="flex-1" onClick={handleFinish}>
                Finish now
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function QuizPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      }
    >
      <QuizContent />
    </Suspense>
  )
}
