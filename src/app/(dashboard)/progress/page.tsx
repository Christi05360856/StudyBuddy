// PATH: src/app/(dashboard)/progress/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { BottomNav } from "@/components/bottom-nav"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BackButton } from "@/components/back-button"
import { createClient } from "@/lib/supabase/client"

type CourseRef = { code: string } | { code: string }[] | null
type MaterialRef =
  | { title: string; courses: CourseRef }
  | { title: string; courses: CourseRef }[]
  | null

type RawAttempt = {
  id: string
  type: string
  total_questions: number
  correct_count: number
  time_taken_seconds: number
  created_at: string
  materials: MaterialRef
}

type Attempt = {
  id: string
  type: string
  total: number
  correct: number
  percent: number
  seconds: number
  date: string
  noteTitle: string
  courseCode: string
}

// Supabase may return a joined row as an object or as a list of one; handle both
function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function scoreColor(percent: number): string {
  if (percent >= 70) return "text-success"
  if (percent >= 50) return "text-amber-600"
  return "text-danger"
}

export default function ProgressPage() {
  const supabase = createClient()
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from("quiz_attempts")
        .select(
          "id, type, total_questions, correct_count, time_taken_seconds, created_at, materials(title, courses(code))"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200)

      if (error) {
        setFailed(true)
        setLoading(false)
        return
      }

      const list: Attempt[] = ((data ?? []) as unknown as RawAttempt[]).map((a) => {
        const material = first(a.materials)
        const course = first(material?.courses ?? null)
        return {
          id: a.id,
          type: a.type,
          total: a.total_questions,
          correct: a.correct_count,
          percent: a.total_questions > 0 ? Math.round((a.correct_count / a.total_questions) * 100) : 0,
          seconds: a.time_taken_seconds,
          date: a.created_at,
          noteTitle: material?.title ?? "Deleted note",
          courseCode: course?.code ?? "Course",
        }
      })

      setAttempts(list)
      setLoading(false)
    }
    load()
  }, [])

  // Summary numbers
  const average =
    attempts.length > 0 ? Math.round(attempts.reduce((sum, a) => sum + a.percent, 0) / attempts.length) : 0
  const best = attempts.reduce((max, a) => Math.max(max, a.percent), 0)

  // Average score for each course
  const byCourse = new Map<string, { total: number; count: number }>()
  attempts.forEach((a) => {
    const row = byCourse.get(a.courseCode) ?? { total: 0, count: 0 }
    row.total += a.percent
    row.count += 1
    byCourse.set(a.courseCode, row)
  })
  const courseRows = Array.from(byCourse.entries())
    .map(([code, v]) => ({ code, average: Math.round(v.total / v.count), count: v.count }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-5 pt-8">
        <div className="flex items-center gap-3 mb-6">
          <BackButton fallback="/home" />
          <h1 className="text-2xl font-bold">Progress</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
        ) : failed ? (
          <p className="text-center text-gray-500 py-16">Could not load your progress. Please try again.</p>
        ) : attempts.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-8 text-center space-y-4">
            <p className="text-gray-500">
              You have not taken a quiz yet. Your scores will show up here.
            </p>
            <Link href="/courses">
              <Button>Go to courses</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Quizzes taken", value: String(attempts.length) },
                { label: "Average score", value: `${average}%` },
                { label: "Best score", value: `${best}%` },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl bg-card border border-border p-4 text-center">
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            <section>
              <h2 className="font-semibold mb-3">By course</h2>
              <div className="space-y-2">
                {courseRows.map((c) => (
                  <div key={c.code} className="rounded-2xl bg-card border border-border p-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="font-medium">{c.code}</span>
                      <span className="text-gray-500">
                        {c.average}% average · {c.count} {c.count === 1 ? "quiz" : "quizzes"}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${c.average}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="font-semibold mb-1">Recent quizzes</h2>
              <p className="text-xs text-gray-400 mb-3">Tap a quiz to review your answers.</p>
              <div className="space-y-2">
                {attempts.slice(0, 20).map((a) => (
                  <Link
                    key={a.id}
                    href={`/quiz/result?attempt=${a.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-card border border-border p-4 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{a.noteTitle}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {a.courseCode} · <span className="capitalize">{a.type}</span> ·{" "}
                        {new Date(a.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ·{" "}
                        {formatTime(a.seconds)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn("font-bold", scoreColor(a.percent))}>{a.percent}%</p>
                      <p className="text-xs text-gray-500">
                        {a.correct}/{a.total}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
