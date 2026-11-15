// PATH: src/app/admin/(protected)/page.tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Users,
  FileText,
  BookOpen,
  Flame,
  RefreshCw,
  LogOut,
  Loader2,
  LayoutDashboard,
  ClipboardList,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Stats = {
  users: number
  materials: number
  courses: number
  quizAttempts: number
  materialsReady: number
  materialsFailed: number
  materialsProcessing: number
  activeStudentsWeek: number
  aiLimits: Record<string, number>
  aiUsageToday: { feature: string; total: number }[]
}

type UserRow = {
  id: string
  full_name: string
  institution: string | null
  department: string | null
  level: string | null
  materials: number
  courses: number
  studyDays: number
  lastStudyDay: string | null
  quizAttempts: number
  created_at: string
}

type MatRow = {
  id: string
  title: string
  status: string
  questions: number
  user_name: string
  course_code: string
  created_at: string
}

type Tab = "overview" | "users" | "materials"

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ size?: number; className?: string }>
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex gap-4 items-start">
      <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
        {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("overview")
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [materials, setMaterials] = useState<MatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reprocessing, setReprocessing] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, u, m] = await Promise.all([
        fetch("/api/admin/stats").then((r) => r.json()),
        fetch("/api/admin/users").then((r) => r.json()),
        fetch("/api/admin/materials").then((r) => r.json()),
      ])
      if (s.error || u.error || m.error) {
        if (s.error === "Unauthorized" || u.error === "Unauthorized") {
          router.replace("/admin/login")
          return
        }
        setError(s.error || u.error || m.error)
      } else {
        setStats(s)
        setUsers(u.users ?? [])
        setMaterials(m.materials ?? [])
      }
    } catch {
      setError("Could not load admin data.")
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" })
    router.replace("/admin/login")
  }

  const reprocess = async (id: string) => {
    setReprocessing(id)
    setToast(null)
    try {
      const res = await fetch("/api/admin/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId: id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setToast(data.error || "Reprocess failed")
      } else {
        setToast(`Refreshed · ${data.questionsGenerated} questions`)
        await load()
      }
    } catch {
      setToast("Network error")
    } finally {
      setReprocessing(null)
      setTimeout(() => setToast(null), 4000)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center">
              <LayoutDashboard size={16} />
            </div>
            <div>
              <p className="text-sm font-bold leading-none">StudyBuddy Admin</p>
              <p className="text-[11px] text-gray-500 mt-0.5">PawsPatrol</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="p-2 rounded-xl hover:bg-muted text-gray-500"
              aria-label="Refresh"
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-danger px-2 py-1.5 rounded-xl hover:bg-muted"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 p-1 rounded-2xl bg-muted w-fit flex-wrap">
          {(
            [
              { id: "overview", label: "Overview", icon: LayoutDashboard },
              { id: "users", label: "Students", icon: Users },
              { id: "materials", label: "Materials", icon: FileText },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-medium transition-colors",
                tab === t.id ? "bg-card text-foreground shadow-sm" : "text-gray-500 hover:text-foreground"
              )}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {toast && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground">
            {toast}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-danger/30 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {loading && !stats ? (
          <div className="flex justify-center py-24">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
        ) : (
          <>
            {tab === "overview" && stats && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard label="Students" value={stats.users} icon={Users} />
                  <StatCard
                    label="Active (7 days)"
                    value={stats.activeStudentsWeek}
                    icon={Flame}
                    hint="Had at least one study day"
                  />
                  <StatCard label="Courses" value={stats.courses} icon={BookOpen} />
                  <StatCard label="Quiz attempts" value={stats.quizAttempts} icon={ClipboardList} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard
                    label="Materials ready"
                    value={stats.materialsReady}
                    icon={FileText}
                    hint={`${stats.materials} total · ${stats.materialsFailed} failed · ${stats.materialsProcessing} processing`}
                  />
                  <div className="rounded-2xl border border-border bg-card p-5 sm:col-span-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                      Daily AI limits (per student)
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(stats.aiLimits).map(([k, v]) => (
                        <div
                          key={k}
                          className="px-3 py-2 rounded-xl bg-muted text-sm"
                        >
                          <span className="text-gray-500">{k}</span>
                          <span className="font-semibold ml-2">{v}/day</span>
                        </div>
                      ))}
                    </div>
                    {stats.aiUsageToday.length > 0 ? (
                      <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-xs text-gray-500 mb-2">Usage logged today (Lagos)</p>
                        <div className="flex flex-wrap gap-2">
                          {stats.aiUsageToday.map((u) => (
                            <span key={u.feature} className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-medium">
                              {u.feature}: {u.total}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mt-4">
                        Per-student usage is enforced in the app. Detailed logs appear if{" "}
                        <code className="text-[11px]">ai_daily_usage</code> exists.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {tab === "users" && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="font-semibold">Students</h2>
                  <span className="text-xs text-gray-500">{users.length} shown</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-border">
                        <th className="px-5 py-3 font-medium">Name</th>
                        <th className="px-3 py-3 font-medium">School</th>
                        <th className="px-3 py-3 font-medium">Dept</th>
                        <th className="px-3 py-3 font-medium text-right">Courses</th>
                        <th className="px-3 py-3 font-medium text-right">Notes</th>
                        <th className="px-3 py-3 font-medium text-right">Study days</th>
                        <th className="px-3 py-3 font-medium text-right">Quizzes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                          <td className="px-5 py-3.5 font-medium">{u.full_name || "—"}</td>
                          <td className="px-3 py-3.5 text-gray-500 max-w-[140px] truncate">
                            {u.institution || "—"}
                          </td>
                          <td className="px-3 py-3.5 text-gray-500 max-w-[120px] truncate">
                            {u.department || "—"}
                          </td>
                          <td className="px-3 py-3.5 text-right tabular-nums">{u.courses}</td>
                          <td className="px-3 py-3.5 text-right tabular-nums">{u.materials}</td>
                          <td className="px-3 py-3.5 text-right tabular-nums">{u.studyDays}</td>
                          <td className="px-3 py-3.5 text-right tabular-nums">{u.quizAttempts}</td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                            No students yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === "materials" && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="font-semibold">Materials</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Refresh runs the current AI model (new question counts). Does not use the student&apos;s daily limit.
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {materials.map((m) => (
                    <div
                      key={m.id}
                      className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{m.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {m.course_code} · {m.user_name} · {m.questions}Q ·{" "}
                          <span
                            className={cn(
                              m.status === "ready" && "text-success",
                              m.status === "failed" && "text-danger",
                              m.status === "processing" && "text-amber-600"
                            )}
                          >
                            {m.status}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={reprocessing === m.id}
                        onClick={() => void reprocess(m.id)}
                        className="shrink-0 h-10 px-4 rounded-xl border border-border text-sm font-medium hover:border-primary/40 hover:text-primary disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {reprocessing === m.id ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Working…
                          </>
                        ) : (
                          <>
                            <RefreshCw size={14} />
                            Refresh quiz
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                  {materials.length === 0 && (
                    <p className="px-5 py-12 text-center text-gray-500">No materials yet</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
