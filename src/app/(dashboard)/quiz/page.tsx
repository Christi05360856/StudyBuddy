// PATH: src/app/(dashboard)/quiz/page.tsx
"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Flag, Loader2, Minus, Plus, Timer } from "lucide-react"
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

// The longest timer a student can choose
const MAX_MINUTES = 180

// Keeps the question count between 5 (or fewer if the note has fewer) and the number available
function clampCount(n: number, total: number): number {
  const min = Math.min(5, total)
  return Math.max(min, Math.min(total, Math.round(n)))
}

// Keeps the timer between 0 (no timer) and the maximum
function clampMinutes(n: number): number {
  if (n <= 0) return 0
  return Math.max(1, Math.min(MAX_MINUTES, Math.round(n)))
}

function QuizContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const materialId = searchParams.get("material")
  const type = searchParams.get("type") || "test"
  // When set, the quiz only uses the questions the student got wrong or skipped in that attempt
  const retryAttemptId = searchParams.get("retry")

  // ----- Default settings (the student can change them on the setup screen) -----
  // Test: up to 30 questions in 8 minutes. Exam: up to 50 questions in 10 minutes.
  const defaultCount = type === "exam" ? 50 : 30
  const defaultMinutes = type === "exam" ? 10 : 8
  const SETTINGS_KEY = `studybuddy-quiz-settings-${type}`

  const [loading, setLoading] = useState(true)
  // Every question this note has (shuffled once). The quiz uses the first "count" of them.
  const [pool, setPool] = useState<Question[]>([])
  // true when the quiz only has the questions the student missed before
  const [retryMode, setRetryMode] = useState(false)

  // Setup screen choices
  const [started, setStarted] = useState(false)
  const [count, setCount] = useState(defaultCount)
  const [minutes, setMinutes] = useState(defaultMinutes) // 0 means "no timer"
  const [customMode, setCustomMode] = useState(false)
  const [customText, setCustomText] = useState("")

  // The quiz itself
  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  // question id -> the option the student picked. An answer is saved the moment it is tapped.
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [timeLimit, setTimeLimit] = useState(0) // seconds, 0 = no timer
  const [elapsed, setElapsed] = useState(0) // seconds used so far
  const startedAt = useRef(0)
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
      let list: Question[] = []
      let retry = false

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
            list = missed
            retry = true
          }
        }
        // Nothing to practise (or the questions were replaced): fall through to a normal quiz
      }

      if (!retry) {
        const { data, error } = await supabase.from("questions").select(columns).eq("material_id", materialId)
        if (error || !data || data.length === 0) {
          setPool([])
          setLoading(false)
          return
        }
        list = data
      }

      const mixed = [...list].sort(() => Math.random() - 0.5)
      setPool(mixed)
      setRetryMode(retry)

      // Start from the defaults, or from what the student chose last time
      let startCount = Math.min(defaultCount, mixed.length)
      let startMinutes = defaultMinutes
      if (retry) {
        // One minute per missed question, and never less than two minutes
        startCount = mixed.length
        startMinutes = Math.max(2, mixed.length)
      } else {
        try {
          const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null")
          if (saved && Number.isFinite(saved.count) && Number.isFinite(saved.minutes)) {
            startCount = clampCount(saved.count, mixed.length)
            startMinutes = clampMinutes(saved.minutes)
          }
        } catch {
          // storage blocked or old data: use the defaults
        }
      }
      setCount(startCount)
      setMinutes(startMinutes)
      setLoading(false)
    }

    loadQuestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialId, retryAttemptId])

  // The student pressed "Start": fix the questions and the timer, then begin
  const startQuiz = () => {
    const finalCount = clampCount(count, pool.length)
    const finalMinutes = clampMinutes(minutes)

    if (!retryMode) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ count: finalCount, minutes: finalMinutes }))
      } catch {
        // storage blocked: the choice just will not be remembered
      }
    }

    setQuestions(pool.slice(0, finalCount))
    setTimeLimit(finalMinutes * 60)
    setElapsed(0)
    startedAt.current = Date.now()
    setStarted(true)
  }

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

    // Time used, read from the real clock. Never more than the time limit (when there is one).
    const used = Math.floor((Date.now() - startedAt.current) / 1000)
    const seconds = timeLimit > 0 ? Math.min(used, timeLimit) : used

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
  }, [finished, questions, answers, materialId, type, timeLimit, router, supabase])

  // handleFinish changes whenever an answer changes, so the clock keeps a pointer to the newest one
  const finishRef = useRef(handleFinish)
  useEffect(() => {
    finishRef.current = handleFinish
  }, [handleFinish])

  // Clock: checks the real time every second, so it stays correct even if the phone sleeps a bit.
  // When a timer is set and the time is up, the quiz finishes by itself.
  useEffect(() => {
    if (!started || finished || questions.length === 0) return
    const t = setInterval(() => {
      const used = Math.floor((Date.now() - startedAt.current) / 1000)
      setElapsed(used)
      if (timeLimit > 0 && used >= timeLimit) finishRef.current()
    }, 1000)
    return () => clearInterval(t)
  }, [started, finished, questions.length, timeLimit])

  // Time left (only when the quiz has a timer)
  const timed = timeLimit > 0
  const timeLeft = timed ? Math.max(0, timeLimit - elapsed) : 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  // Nothing to practise at all (the setup screen comes after this check)
  if (pool.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5">
        <p className="text-gray-500 text-center">No questions available for this material yet.</p>
        <Button onClick={() => router.back()}>Go back</Button>
      </div>
    )
  }

  // ----- Setup screen: the student chooses how many questions and how long -----
  if (!started) {
    const total = pool.length
    const minCount = Math.min(5, total)
    const timerChips = [5, 10, 15, 20, 30, 45, 60]
    const customValue = parseInt(customText, 10)
    const customOk = Number.isFinite(customValue) && customValue >= 1 && customValue <= MAX_MINUTES
    const canStart = count >= minCount && (!customMode || customOk)
    const title = retryMode ? "Practice my mistakes" : type === "exam" ? "Exam" : "Test"

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 px-5 py-8 max-w-lg mx-auto w-full space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Choose how many questions you want and how much time you get.
            </p>
          </div>

          {/* How many questions */}
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">Questions</p>
              <p className="text-xs text-gray-500">{total} available</p>
            </div>

            <div className="flex items-center justify-center gap-5">
              <button
                type="button"
                aria-label="Fewer questions"
                onClick={() => setCount((c) => clampCount(c - 1, total))}
                disabled={count <= minCount}
                className="p-3 rounded-xl border border-border disabled:opacity-40"
              >
                <Minus size={18} />
              </button>
              <span className="text-4xl font-semibold w-20 text-center">{count}</span>
              <button
                type="button"
                aria-label="More questions"
                onClick={() => setCount((c) => clampCount(c + 1, total))}
                disabled={count >= total}
                className="p-3 rounded-xl border border-border disabled:opacity-40"
              >
                <Plus size={18} />
              </button>
            </div>

            {total > minCount && (
              <input
                type="range"
                min={minCount}
                max={total}
                value={count}
                onChange={(e) => setCount(clampCount(Number(e.target.value), total))}
                className="w-full accent-primary"
                aria-label="Number of questions"
              />
            )}

            <div className="flex flex-wrap gap-2">
              {[10, 20].filter((n) => n < total && n >= minCount).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-sm",
                    count === n ? "bg-primary text-white border-primary" : "border-border"
                  )}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCount(total)}
                className={cn(
                  "px-3 py-1.5 rounded-full border text-sm",
                  count === total ? "bg-primary text-white border-primary" : "border-border"
                )}
              >
                All {total}
              </button>
            </div>
          </div>

          {/* How much time */}
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Timer size={18} className="text-gray-500" />
              <p className="font-medium">Timer</p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {timerChips.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMinutes(m)
                    setCustomMode(false)
                  }}
                  className={cn(
                    "py-2.5 rounded-xl border text-sm font-medium",
                    !customMode && minutes === m ? "bg-primary text-white border-primary" : "border-border"
                  )}
                >
                  {m} min
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCustomMode(true)
                  setCustomText(minutes > 0 ? String(minutes) : "")
                }}
                className={cn(
                  "py-2.5 rounded-xl border text-sm font-medium",
                  customMode ? "bg-primary text-white border-primary" : "border-border"
                )}
              >
                Custom
              </button>
            </div>

            {customMode && (
              <div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_MINUTES}
                    value={customText}
                    onChange={(e) => {
                      setCustomText(e.target.value)
                      const n = parseInt(e.target.value, 10)
                      if (Number.isFinite(n) && n >= 1 && n <= MAX_MINUTES) setMinutes(n)
                    }}
                    placeholder="e.g. 25"
                    className="h-12 w-28 rounded-xl border border-border bg-card px-4 text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  <span className="text-sm text-gray-500">minutes</span>
                </div>
                {customText && !customOk && (
                  <p className="text-xs text-danger mt-1.5">Enter a number from 1 to {MAX_MINUTES}.</p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setMinutes(0)
                setCustomMode(false)
              }}
              className={cn(
                "w-full py-2.5 rounded-xl border text-sm font-medium",
                !customMode && minutes === 0 ? "bg-primary text-white border-primary" : "border-border"
              )}
            >
              No timer (take your time)
            </button>
          </div>

          <p className="text-sm text-gray-500 text-center">
            {count} {count === 1 ? "question" : "questions"} ·{" "}
            {minutes > 0 && !(customMode && !customOk) ? `${minutes} minutes` : "no time limit"}
          </p>
        </div>

        <div className="px-5 py-4 border-t border-border bg-card safe-area-pb">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <Button variant="outline" onClick={() => router.back()} className="flex-1">
              Back
            </Button>
            <Button onClick={startQuiz} disabled={!canStart} className="flex-1">
              Start
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const q = questions[current]
  const selected = answers[q.id] ?? null
  // Shows time left when there is a timer, or time used when there is none
  const shown = timed ? timeLeft : elapsed
  const shownMinutes = Math.floor(shown / 60)
  const shownSeconds = shown % 60
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
            <p className="text-sm text-gray-500 capitalize">{retryMode ? "Practice" : type}</p>
            <div className="flex items-center gap-1.5 text-sm font-medium bg-muted px-3 py-1 rounded-full">
              <span className={cn(timed && timeLeft < 60 && "text-danger")}>
                {String(shownMinutes).padStart(2, "0")}:{String(shownSeconds).padStart(2, "0")}
              </span>
              {!timed && <span className="text-xs text-gray-400">no limit</span>}
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
