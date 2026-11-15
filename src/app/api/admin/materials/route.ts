// PATH: src/app/api/admin/materials/route.ts
import { NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/admin/session"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    const { data: materials, error } = await supabase
      .from("materials")
      .select("id, title, status, page_count, user_id, course_id, created_at, file_path")
      .order("created_at", { ascending: false })
      .limit(150)

    if (error) throw error

    const userIds = [...new Set((materials ?? []).map((m) => m.user_id))]
    const courseIds = [...new Set((materials ?? []).map((m) => m.course_id).filter(Boolean))]

    const [{ data: profiles }, { data: courses }, { data: qCounts }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      courseIds.length
        ? supabase.from("courses").select("id, code, title").in("id", courseIds)
        : Promise.resolve({ data: [] as { id: string; code: string; title: string | null }[] }),
      supabase.from("questions").select("material_id"),
    ])

    const nameBy = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
    const courseBy = new Map((courses ?? []).map((c) => [c.id, c]))
    const qBy = new Map<string, number>()
    for (const q of qCounts.data ?? []) {
      qBy.set(q.material_id, (qBy.get(q.material_id) ?? 0) + 1)
    }

    const list = (materials ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      page_count: m.page_count,
      created_at: m.created_at,
      user_id: m.user_id,
      user_name: nameBy.get(m.user_id) ?? "Unknown",
      course_code: courseBy.get(m.course_id)?.code ?? "—",
      questions: qBy.get(m.id) ?? 0,
    }))

    return NextResponse.json({ materials: list })
  } catch (err) {
    console.error("admin materials:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load materials" },
      { status: 500 }
    )
  }
}
