// PATH: src/app/api/admin/stats/route.ts
import { NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/admin/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { AI_LIMITS } from "@/lib/ai/limits"

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    const [profiles, materials, courses, attempts, readyMats, failedMats, processingMats] =
      await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("materials").select("id", { count: "exact", head: true }),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("quiz_attempts").select("id", { count: "exact", head: true }),
        supabase.from("materials").select("id", { count: "exact", head: true }).eq("status", "ready"),
        supabase.from("materials").select("id", { count: "exact", head: true }).eq("status", "failed"),
        supabase.from("materials").select("id", { count: "exact", head: true }).eq("status", "processing"),
      ])

    // Streak: students with at least one study day in last 7 Lagos-ish days
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekStr = weekAgo.toISOString().slice(0, 10)
    const { data: recentDays } = await supabase
      .from("study_days")
      .select("user_id")
      .gte("day", weekStr)

    const activeWeek = new Set((recentDays ?? []).map((r) => r.user_id)).size

    // Optional AI usage table — ignore if missing
    let aiUsageToday: { feature: string; total: number }[] = []
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })
      const { data: usage, error } = await supabase
        .from("ai_daily_usage")
        .select("feature, used")
        .eq("day", today)
      if (!error && usage) {
        const map = new Map<string, number>()
        for (const row of usage) {
          const f = String(row.feature)
          map.set(f, (map.get(f) ?? 0) + Number(row.used ?? 0))
        }
        aiUsageToday = [...map.entries()].map(([feature, total]) => ({ feature, total }))
      }
    } catch {
      // table may not exist
    }

    return NextResponse.json({
      users: profiles.count ?? 0,
      materials: materials.count ?? 0,
      courses: courses.count ?? 0,
      quizAttempts: attempts.count ?? 0,
      materialsReady: readyMats.count ?? 0,
      materialsFailed: failedMats.count ?? 0,
      materialsProcessing: processingMats.count ?? 0,
      activeStudentsWeek: activeWeek,
      aiLimits: AI_LIMITS,
      aiUsageToday,
    })
  } catch (err) {
    console.error("admin stats:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load stats" },
      { status: 500 }
    )
  }
}
