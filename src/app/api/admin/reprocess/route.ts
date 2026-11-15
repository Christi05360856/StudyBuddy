// PATH: src/app/api/admin/reprocess/route.ts
/**
 * Admin-only: re-run AI on an existing material (new question counts, current model).
 * Does not consume the student's daily process credit.
 */
import { NextRequest, NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/admin/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { analyzeMaterial } from "@/lib/ai/generate-questions"
import { extractContent } from "@/lib/extract-content"

export const maxDuration = 60
export const runtime = "nodejs"

const MAX_INLINE_BYTES = 14 * 1024 * 1024

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { materialId } = await req.json()
    if (!materialId || typeof materialId !== "string") {
      return NextResponse.json({ error: "materialId required" }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: material, error: matError } = await supabase
      .from("materials")
      .select("id, file_path")
      .eq("id", materialId)
      .single()

    if (matError || !material) {
      return NextResponse.json({ error: "Material not found" }, { status: 404 })
    }

    const setProgress = async (stage: string, progress: number) => {
      await supabase.from("materials").update({ stage, progress }).eq("id", materialId)
    }

    await supabase.from("materials").update({ status: "processing" }).eq("id", materialId)
    await setProgress("reading", 5)

    const fail = async (message: string, status = 500) => {
      await supabase.from("materials").update({ status: "failed" }).eq("id", materialId)
      await setProgress("failed", 0)
      return NextResponse.json({ error: message }, { status })
    }

    const { data: file, error: downloadError } = await supabase.storage
      .from("materials")
      .download(material.file_path)

    if (downloadError || !file) {
      return fail("Could not open file: " + (downloadError?.message ?? "unknown"))
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const extracted = await extractContent(buffer, material.file_path)
    if (!extracted.ok) return fail(extracted.error, 422)

    if (extracted.input.type === "inline" && file.size > MAX_INLINE_BYTES) {
      return fail("File too large for AI (max 14MB).", 413)
    }

    await setProgress("writing", 20)

    const analysis = await analyzeMaterial(extracted.input, (done, total) => {
      void setProgress("writing", 20 + Math.round((70 * done) / total))
    })

    if (!analysis.ok) {
      console.error("admin reprocess AI:", analysis.error)
      return fail("AI could not process this file right now.")
    }

    if (analysis.questions.length === 0) {
      return fail("No readable content found in this file.")
    }

    await setProgress("saving", 92)

    const { data: oldQuestions } = await supabase
      .from("questions")
      .select("id")
      .eq("material_id", materialId)

    const rows = analysis.questions.map((q) => ({
      material_id: materialId,
      question_text: q.question_text,
      options: q.options,
      correct_index: q.correct_index,
      explanation: q.explanation || null,
      page_reference: q.page_reference || null,
      topic: q.topic || null,
    }))

    const { error: insertError } = await supabase.from("questions").insert(rows)
    if (insertError) return fail("Could not save questions: " + insertError.message)

    const oldIds = (oldQuestions ?? []).map((q) => q.id)
    if (oldIds.length > 0) {
      await supabase.from("questions").delete().in("id", oldIds)
    }

    const pageCount =
      extracted.input.type === "pages" ? extracted.input.pages.length : analysis.questions.length

    const { error: updateError } = await supabase
      .from("materials")
      .update({
        status: "ready",
        page_count: pageCount,
        content_text: analysis.notes || null,
        topics: analysis.topics,
      })
      .eq("id", materialId)

    if (updateError) return fail("Could not update material: " + updateError.message)

    await setProgress("done", 100)

    return NextResponse.json({
      success: true,
      questionsGenerated: analysis.questions.length,
      topics: analysis.topics?.length ?? 0,
    })
  } catch (err) {
    console.error("admin reprocess:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reprocess failed" },
      { status: 500 }
    )
  }
}
