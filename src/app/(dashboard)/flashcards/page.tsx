// PATH: src/app/(dashboard)/flashcards/page.tsx
"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ArrowLeft, Loader2, RotateCcw, Check, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BottomNav } from "@/components/bottom-nav"
import { createClient } from "@/lib/supabase/client"
import { lagosToday } from "@/lib/streak"
import { cn } from "@/lib/utils"

type Card = {
  key: string
  front: string
  back: string
  topic: string | null
}

type Progress = {
  box: number
  due_date: string
}

function FlashcardsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const materialId = searchParams.get("material") || ""
  const courseId = searchParams.get("course") || ""

  const [loading, setLoading] = useState(true)
  const [materialTitle, setMaterialTitle] = useState("")
  const [session, setSession] = useState<Card[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const transitioning = useRef(false)

  useEffect(() => {
    if (!materialId) {
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) {
        setLoading(false)
        return
      }

      const [matRes, qRes, progRes] = await Promise.all([
        supabase.from("materials").select("title").eq("id", materialId).single(),
        supabase
          .from("questions")
          .select("id, question_text, options, correct_index, explanation, topic")
          .eq("material_id", materialId)
          .order("created_at", { ascending: true }),
        supabase.from("flashcard_progress").select("card_key, box, due_date").eq("user_id", user.id),
      ])

      if (cancelled) return

      if (matRes.data?.title) setMaterialTitle(matRes.data.title)

      const built: Card[] = (qRes.data ?? []).map((q) => {
        const opts = (q.options as string[]) || []
        const answer = opts[q.correct_index] ?? ""
        const explanation = q.explanation ? `\n\n${q.explanation}` : ""
        return {
          key: q.id,
          front: q.question_text,
          back: answer + explanation,
          topic: q.topic,
        }
      })

      const progressMap: Record<string, Progress> = {}
      ;(progRes.data ?? []).forEach((p) => {
        progressMap[p.card_key] = { box: p.box, due_date: p.due_date }
      })

      const today = lagosToday()
      const due = built.filter((c) => {
        const p = progressMap[c.key]
        if (!p) return true
        return p.due_date <= today
      })
      setSession(due.length > 0 ? due : built)
      setIndex(0)
      setFlipped(false)
      setDone(false)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [materialId])

  const current = session[index] ?? null
  const total = session.length
  const progressPct = total > 0 ? Math.round(((index + (flipped ? 0.5 : 0)) / total) * 100) : 0

  const recordStudyDay = async () => {
    try {
      await supabase.rpc("record_study_day")
    } catch {
      // non-fatal
    }
  }

  const goNext = useCallback(() => {
    setFlipped(false)
    transitioning.current = false
    if (index + 1 >= session.length) {
      setDone(true)
    } else {
      setIndex((i) => i + 1)
    }
  }, [index, session.length])

  const answer = async (gotIt: boolean) => {
    if (!current || busy || transitioning.current) return
    setBusy(true)
    transitioning.current = true
    setFlipped(false)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data: prevRow } = await supabase
          .from("flashcard_progress")
          .select("box")
          .eq("user_id", user.id)
          .eq("card_key", current.key)
          .maybeSingle()

        const prevBox = prevRow?.box ?? 1
        const nextBox = gotIt ? Math.min(5, prevBox + 1) : 1
        const intervals = [0, 1, 3, 7, 14]
        const daysAhead = intervals[nextBox - 1] ?? 14
        const due = new Date()
        due.setDate(due.getDate() + daysAhead)
        const dueStr = due.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })

        await supabase.from("flashcard_progress").upsert({
          user_id: user.id,
          card_key: current.key,
          box: nextBox,
          due_date: dueStr,
        })

        await recordStudyDay()
      }
    } catch (err) {
      console.error("flashcard progress save:", err)
    }

    requestAnimationFrame(() => {
      goNext()
      setBusy(false)
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  if (!materialId || session.length === 0) {
    return (
      <div className="min-h-screen pb-24">
        <div className="max-w-lg mx-auto px-5 pt-6">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full hover:bg-muted mb-4"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <p className="text-center text-gray-500 py-16">
            No flashcards yet. Process a note first so the AI can create questions.
          </p>
        </div>
        <BottomNav />
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen pb-24">
        <div className="max-w-lg mx-auto px-5 pt-6">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full hover:bg-muted mb-6"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="text-center py-12 space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-accent-soft flex items-center justify-center">
              <Sparkles className="text-amber-700" size={28} />
            </div>
            <p className="text-2xl font-bold">Nice work</p>
            <p className="text-gray-500">
              You reviewed {total} card{total === 1 ? "" : "s"}.
            </p>
            <div className="flex flex-col gap-3 max-w-xs mx-auto pt-4">
              <Button
                onClick={() => {
                  setIndex(0)
                  setDone(false)
                  setFlipped(false)
                  transitioning.current = false
                }}
              >
                Review again
              </Button>
              {courseId && (
                <Button variant="secondary" onClick={() => router.push(`/courses/${courseId}`)}>
                  Back to course
                </Button>
              )}
            </div>
          </div>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-5 pt-6">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full hover:bg-muted"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-500">Flashcards</p>
            <h1 className="text-lg font-bold truncate">{materialTitle || "Review"}</h1>
          </div>
          <p className="text-sm font-semibold text-primary tabular-nums shrink-0">
            {index + 1}/{total}
          </p>
        </div>

        <div className="h-1.5 rounded-full bg-primary/15 mb-6 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${Math.max(progressPct, 4)}%` }}
          />
        </div>

        {/*
          Brand balance:
          - Question → warm accent yellow (app accent)
          - Answer → primary blue
        */}
        <button
          type="button"
          key={current?.key}
          onClick={() => {
            if (!busy && !transitioning.current) setFlipped((f) => !f)
          }}
          className={cn(
            "relative w-full min-h-[300px] rounded-3xl p-6 text-left",
            "flex flex-col justify-center gap-4",
            "shadow-md transition-all duration-200",
            "active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            flipped
              ? "bg-primary text-white border border-primary shadow-primary/25"
              : "bg-accent text-foreground border border-amber-300/60 shadow-amber-200/40"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                flipped ? "bg-white/20 text-white" : "bg-foreground/10 text-foreground"
              )}
            >
              {flipped ? "Answer" : "Question"}
            </span>
            {current?.topic && (
              <span
                className={cn(
                  "text-xs truncate max-w-[55%]",
                  flipped ? "text-white/70" : "text-foreground/55"
                )}
              >
                {current.topic}
              </span>
            )}
          </div>

          <p
            className={cn(
              "text-[1.05rem] font-medium whitespace-pre-wrap leading-relaxed",
              flipped ? "text-white" : "text-foreground"
            )}
          >
            {flipped ? current?.back : current?.front}
          </p>

          <p
            className={cn(
              "text-xs mt-auto pt-4",
              flipped ? "text-white/60" : "text-foreground/50"
            )}
          >
            {flipped ? "Tap to see the question again" : "Tap to reveal the answer"}
          </p>
        </button>

        {flipped && (
          <div className="flex gap-3 mt-6">
            <Button
              variant="secondary"
              className="flex-1 gap-2 h-12 rounded-xl"
              disabled={busy}
              onClick={() => answer(false)}
            >
              <RotateCcw size={16} />
              Again
            </Button>
            <Button
              className="flex-1 gap-2 h-12 rounded-xl"
              disabled={busy}
              onClick={() => answer(true)}
            >
              <Check size={16} />
              Got it
            </Button>
          </div>
        )}

        {!flipped && (
          <p className="text-center text-xs text-gray-400 mt-6">
            Reveal the answer, then mark whether you knew it.
          </p>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

export default function FlashcardsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      }
    >
      <FlashcardsContent />
    </Suspense>
  )
}
