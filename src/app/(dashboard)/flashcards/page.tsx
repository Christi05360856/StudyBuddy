// PATH: src/app/(dashboard)/flashcards/page.tsx
"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react"
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
  const [cards, setCards] = useState<Card[]>([])
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(false)
  const [materialTitle, setMaterialTitle] = useState("")

  useEffect(() => {
    if (!materialId) {
      setLoading(false)
      return
    }

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
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

      setCards(built)

      const map: Record<string, Progress> = {}
      ;(progRes.data ?? []).forEach((p) => {
        map[p.card_key] = { box: p.box, due_date: p.due_date }
      })
      setProgress(map)
      setLoading(false)
    }

    load()
  }, [materialId])

  // Prefer due cards, otherwise all cards in order
  const dueCards = useMemo(() => {
    const today = lagosToday()
    const due = cards.filter((c) => {
      const p = progress[c.key]
      if (!p) return true
      return p.due_date <= today
    })
    return due.length > 0 ? due : cards
  }, [cards, progress])

  const current = dueCards[index] ?? null

  const recordStudyDay = async () => {
    try {
      await supabase.rpc("record_study_day")
    } catch {
      // non-fatal
    }
  }

  const answer = async (gotIt: boolean) => {
    if (!current) return

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const prev = progress[current.key]
    const nextBox = gotIt ? Math.min(5, (prev?.box ?? 1) + 1) : 1
    // Simple spaced intervals: 0, 1, 3, 7, 14 days
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

    setProgress((p) => ({
      ...p,
      [current.key]: { box: nextBox, due_date: dueStr },
    }))

    // Count this review toward the streak
    await recordStudyDay()

    setFlipped(false)
    if (index + 1 >= dueCards.length) {
      setDone(true)
    } else {
      setIndex((i) => i + 1)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  if (!materialId || cards.length === 0) {
    return (
      <div className="min-h-screen pb-24">
        <div className="max-w-lg mx-auto px-5 pt-6">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-muted mb-4">
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
        <div className="max-w-lg mx-auto px-5 pt-6 text-center">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-muted mb-8 self-start">
            <ArrowLeft size={20} />
          </button>
          <div className="py-16 space-y-4">
            <p className="text-2xl font-bold">Nice work</p>
            <p className="text-gray-500">You reviewed {dueCards.length} card{dueCards.length === 1 ? "" : "s"}.</p>
            <div className="flex flex-col gap-3 max-w-xs mx-auto pt-4">
              <Button
                onClick={() => {
                  setIndex(0)
                  setDone(false)
                  setFlipped(false)
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
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-muted">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Flashcards</p>
            <h1 className="text-lg font-bold truncate">{materialTitle || "Review"}</h1>
          </div>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          {index + 1} of {dueCards.length}
        </p>

        {/* Card */}
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          className={cn(
            "w-full min-h-[240px] rounded-2xl border border-border bg-card p-6 text-left transition-colors",
            "flex flex-col justify-center gap-3 active:scale-[0.99]"
          )}
        >
          <p className="text-xs font-medium text-primary uppercase tracking-wide">
            {flipped ? "Answer" : "Question"}
          </p>
          <p className="text-base font-medium text-foreground whitespace-pre-wrap">
            {flipped ? current?.back : current?.front}
          </p>
          {current?.topic && !flipped && (
            <p className="text-xs text-gray-400 mt-2">Topic: {current.topic}</p>
          )}
          <p className="text-xs text-gray-400 mt-auto pt-4">
            {flipped ? "Tap for question" : "Tap to reveal answer"}
          </p>
        </button>

        {/* Actions – only after flip so the student sees the answer first */}
        {flipped && (
          <div className="flex gap-3 mt-6">
            <Button
              variant="secondary"
              className="flex-1 gap-2"
              onClick={() => answer(false)}
            >
              <RotateCcw size={16} />
              Again
            </Button>
            <Button className="flex-1" onClick={() => answer(true)}>
              Got it
            </Button>
          </div>
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
