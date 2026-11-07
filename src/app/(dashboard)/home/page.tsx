// PATH: src/app/(dashboard)/home/page.tsx
"use client"

import { useEffect, useState } from "react"
import { BottomNav } from "@/components/bottom-nav"
import { Plus, Loader2, ChevronRight, FileText, Flame, Calendar } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { computeStreak, daysUntil, lagosToday } from "@/lib/streak"
import { cn } from "@/lib/utils"
import { HeadphonesButton } from "@/components/music/headphones-button"
import type { SharedMaterialRow } from "@/lib/share"

type Course = {
  id: string
  code: string
  title: string | null
  assessment_date: string | null
  assessment_type?: string | null
}
type Note = {
  id: string
  title: string
  course_id: string
  status?: string | null
  created_at?: string | null
}

function getInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export default function HomePage() {
  const [fullName, setFullName] = useState("")
  const [courses, setCourses] = useState<Course[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [streak, setStreak] = useState(0)
  const [deptShares, setDeptShares] = useState<
    { code: string; title: string | null; count: number }[]
  >([])
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const [profileRes, coursesRes, notesRes, daysRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, department, level, institution")
          .eq("id", user.id)
          .single(),
        supabase
          .from("courses")
          .select("id, code, title, assessment_date")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("materials")
          .select("id, title, course_id, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase.from("study_days").select("day").eq("user_id", user.id),
      ])

      if (profileRes.data?.full_name) setFullName(profileRes.data.full_name)
      if (coursesRes.data) setCourses(coursesRes.data)
      if (notesRes.data) setNotes(notesRes.data)

      const days = (daysRes.data ?? []).map((r) => r.day as string)
      setStreak(computeStreak(days))

      // Department shared courses (grouped by code)
      if (profileRes.data?.institution && profileRes.data?.department) {
        const { data: shared } = await supabase
          .from("shared_materials")
          .select("course_code, course_title, code_normalized")
          .eq("institution", profileRes.data.institution)
          .eq("department", profileRes.data.department)

        const map = new Map<string, { code: string; title: string | null; count: number }>()
        for (const row of shared || []) {
          const k = row.code_normalized as string
          const prev = map.get(k)
          if (prev) prev.count += 1
          else
            map.set(k, {
              code: row.course_code as string,
              title: (row.course_title as string) || null,
              count: 1,
            })
        }
        setDeptShares([...map.values()].slice(0, 6))
      }

      setLoading(false)
    }
    load()
  }, [])

  const firstName = fullName.split(" ")[0] || "there"
  // Use Africa/Lagos so greeting matches Nigerian local time (not UTC server time)
  const lagosHour = Number(
    new Date().toLocaleString("en-GB", {
      timeZone: "Africa/Lagos",
      hour: "numeric",
      hour12: false,
    })
  )
  const greeting =
    lagosHour < 12 ? "Good morning" : lagosHour < 17 ? "Good afternoon" : "Good evening"

  const notesCount = (courseId: string) => notes.filter((n) => n.course_id === courseId).length

  // Nearest upcoming assessment (or most recent past one if none upcoming)
  const today = lagosToday()
  const withDate = courses.filter((c) => c.assessment_date)
  const upcoming = withDate
    .filter((c) => (c.assessment_date as string) >= today)
    .sort((a, b) => ((a.assessment_date as string) < (b.assessment_date as string) ? -1 : 1))
  const nearest = upcoming[0] ?? null
  const nearestDays = nearest?.assessment_date ? daysUntil(nearest.assessment_date) : null

  const query = search.trim().toLowerCase()
  const matchedCourses = courses.filter(
    (c) => c.code.toLowerCase().includes(query) || (c.title ?? "").toLowerCase().includes(query)
  )
  const matchedNotes = notes.filter((n) => n.title.toLowerCase().includes(query))

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-5 pt-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-sm text-gray-500">{greeting}</p>
            <h1 className="text-2xl font-bold text-foreground">
              {loading ? "..." : `Hi, ${firstName}`}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <HeadphonesButton />
            <Link
              href="/profile"
              aria-label="Open my profile"
              className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-sm font-bold text-foreground"
            >
              {fullName ? getInitials(fullName) : "?"}
            </Link>
          </div>
        </div>

        {/* Streak (+ next assessment only when a date is set) */}
        {!loading && (
          <div
            className={cn(
              "grid gap-3 mb-4",
              nearest ? "grid-cols-2" : "grid-cols-1"
            )}
          >
            <div className="rounded-2xl bg-card border border-border p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <Flame size={20} className="text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Streak</p>
                <p className="font-bold text-foreground">
                  {streak > 0 ? `${streak} day${streak === 1 ? "" : "s"}` : "Start today"}
                </p>
              </div>
            </div>
            {nearest && nearestDays !== null && (
              <div className="rounded-2xl bg-card border border-border p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Calendar size={20} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Next test</p>
                  <p className="font-bold text-foreground truncate">
                    {nearest.code} ·{" "}
                    {nearestDays === 0
                      ? "today"
                      : nearestDays === 1
                        ? "1 day"
                        : `${nearestDays} days`}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Continue studying — most recent ready note */}
        {!loading && (() => {
          const ready = notes.filter((n) => n.status === "ready" || !n.status)
          const last = ready[0]
          if (!last) return null
          const course = courses.find((c) => c.id === last.course_id)
          return (
            <Link
              href={`/courses/${last.course_id}`}
              className="block mb-6 rounded-2xl bg-primary text-white p-4 shadow-sm hover:bg-primary-hover transition-colors"
            >
              <p className="text-xs text-white/75 mb-0.5">Continue studying</p>
              <p className="font-semibold text-base leading-snug truncate">
                {course ? `${course.code}` : "Your course"}
                {course?.title ? ` · ${course.title}` : ""}
              </p>
              <p className="text-sm text-white/80 mt-1 truncate">{last.title}</p>
            </Link>
          )
        })()}

        <div className="relative mb-8">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search courses and notes"
            className="w-full h-12 rounded-xl border border-border bg-card pl-4 pr-4 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {query ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-semibold text-foreground mb-3">Courses</h2>
              {matchedCourses.length === 0 ? (
                <p className="text-sm text-gray-500">No matching courses.</p>
              ) : (
                <div className="space-y-2">
                  {matchedCourses.map((c) => (
                    <Link
                      key={c.id}
                      href={`/courses/${c.id}`}
                      className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border"
                    >
                      <p className="font-semibold flex-1">{c.code}</p>
                      <ChevronRight size={18} className="text-gray-400" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h2 className="font-semibold text-foreground mb-3">Notes</h2>
              {matchedNotes.length === 0 ? (
                <p className="text-sm text-gray-500">No matching notes.</p>
              ) : (
                <div className="space-y-2">
                  {matchedNotes.map((n) => (
                    <Link
                      key={n.id}
                      href={`/courses/${n.course_id}`}
                      className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border"
                    >
                      <FileText size={18} className="text-gray-400 shrink-0" />
                      <p className="text-sm font-medium truncate flex-1">{n.title}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <Link
              href="/courses"
              className="flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-border mb-8 hover:border-primary/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Plus size={20} className="text-gray-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">Add class notes</p>
                <p className="text-sm text-gray-500">Upload a PDF and get a quiz</p>
              </div>
            </Link>

            {deptShares.length > 0 && (
              <div className="mb-8">
                <h2 className="font-semibold text-foreground mb-1">From your department</h2>
                <p className="text-xs text-gray-500 mb-3">Shared courses — add them free, no AI cost.</p>
                <div className="space-y-2">
                  {deptShares.map((s) => (
                    <Link
                      key={s.code}
                      href="/courses"
                      className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        {s.code.split(" ")[0].slice(0, 4)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{s.code}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {s.title ? `${s.title} · ` : ""}
                          {s.count} shared note{s.count === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-primary">Open</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2 mb-4">
              <Link href="/courses" className="text-sm font-medium text-primary">
                See all my courses →
              </Link>
            </div>

          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
