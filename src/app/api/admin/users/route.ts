// PATH: src/app/api/admin/users/route.ts
import { NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/admin/session"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, full_name, institution, department, level, role, created_at")
      .order("created_at", { ascending: false })
      .limit(200)

    if (error) throw error

    const ids = (profiles ?? []).map((p) => p.id)
    if (ids.length === 0) {
      return NextResponse.json({ users: [] })
    }

    const [mats, courses, days, attempts] = await Promise.all([
      supabase.from("materials").select("user_id").in("user_id", ids),
      supabase.from("courses").select("user_id").in("user_id", ids),
      supabase.from("study_days").select("user_id, day").in("user_id", ids),
      supabase.from("quiz_attempts").select("user_id").in("user_id", ids),
    ])

    const countBy = (rows: { user_id: string }[] | null) => {
      const m = new Map<string, number>()
      for (const r of rows ?? []) m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1)
      return m
    }

    const matCount = countBy(mats.data)
    const courseCount = countBy(courses.data)
    const attemptCount = countBy(attempts.data)

    // Streak approx: distinct study days (not consecutive, but useful volume)
    const dayCount = new Map<string, number>()
    const lastDay = new Map<string, string>()
    for (const r of days.data ?? []) {
      dayCount.set(r.user_id, (dayCount.get(r.user_id) ?? 0) + 1)
      const prev = lastDay.get(r.user_id)
      if (!prev || r.day > prev) lastDay.set(r.user_id, r.day)
    }

    const users = (profiles ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      institution: p.institution,
      department: p.department,
      level: p.level,
      role: p.role,
      created_at: p.created_at,
      materials: matCount.get(p.id) ?? 0,
      courses: courseCount.get(p.id) ?? 0,
      studyDays: dayCount.get(p.id) ?? 0,
      lastStudyDay: lastDay.get(p.id) ?? null,
      quizAttempts: attemptCount.get(p.id) ?? 0,
    }))

    return NextResponse.json({ users })
  } catch (err) {
    console.error("admin users:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load users" },
      { status: 500 }
    )
  }
}
