// PATH: src/app/api/process-material/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { analyzeMaterial } from "@/lib/ai/generate-questions"
import { extractContent } from "@/lib/extract-content"

// Give the AI up to 60 seconds to read the file
export const maxDuration = 60

// The file readers (Word, Excel, PowerPoint) need the full Node.js runtime
export const runtime = "nodejs"

// PDFs and photos are sent to the AI as base64, which makes them about 33% bigger.
// The AI accepts about 20MB per request, so we stop at 14MB.
const MAX_INLINE_BYTES = 14 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const { materialId } = await req.json()
    if (!materialId) {
      return NextResponse.json({ error: "materialId required" }, { status: 400 })
    }

    // Use the logged-in student's own session (no extra keys needed)
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Please log in again." }, { status: 401 })
    }

    const { data: material, error: matError } = await supabase
      .from("materials")
      .select("id, file_path")
      .eq("id", materialId)
      .eq("user_id", user.id)
      .single()

    if (matError || !material) {
      return NextResponse.json({ error: "Material not found" }, { status: 404 })
    }

    await supabase.from("materials").update({ status: "processing" }).eq("id", materialId)

    // A helper so every failure marks the material as failed and explains why
    const fail = async (message: string, status = 500) => {
      await supabase.from("materials").update({ status: "failed" }).eq("id", materialId)
      return NextResponse.json({ error: message }, { status })
    }

    // Step 1: download the file from storage
    const { data: file, error: downloadError } = await supabase.storage
      .from("materials")
      .download(material.file_path)

    if (downloadError || !file) {
      return fail("Could not open the uploaded file: " + (downloadError?.message ?? "unknown error"))
    }

    // Step 2: get the content out of the file (PDF/photo as they are, other files as text)
    const buffer = Buffer.from(await file.arrayBuffer())
    const extracted = await extractContent(buffer, material.file_path)

    if (!extracted.ok) {
      return fail(extracted.error, 422)
    }

    if (extracted.input.type === "inline" && file.size > MAX_INLINE_BYTES) {
      return fail("This file is too large for the AI to read (maximum 14MB).", 413)
    }

    // Step 3 (part 1): let the AI read it
    const analysis = await analyzeMaterial(extracted.input)

    if (!analysis.ok) {
      return fail("AI error: " + analysis.error)
    }

    if (analysis.questions.length === 0) {
      return fail(
        "The AI could not find readable content in this file. If it is a scan or photo, make sure it is clear and well lit."
      )
    }

    // Step 3 (part 2): remove old questions (when the student pressed Try again), then save the new ones
    await supabase.from("questions").delete().eq("material_id", materialId)

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
    if (insertError) {
      console.error("Insert questions error:", insertError)
      return fail("Could not save the questions: " + insertError.message)
    }

    // Step 4: save the notes and topics for the AI Tutor, and mark the material ready
    const { error: updateError } = await supabase
      .from("materials")
      .update({
        status: "ready",
        page_count: analysis.questions.length,
        content_text: analysis.notes || null,
        // An empty list (not null) means "processed, but no topics found"
        topics: analysis.topics,
      })
      .eq("id", materialId)

    if (updateError) {
      // Most likely the SQL update has not been run yet (missing columns)
      console.error("Update material error:", updateError)
      return fail(
        "Could not save the notes: " + updateError.message + " (did you run supabase-update-1.sql?)"
      )
    }

    return NextResponse.json({ success: true, questionsGenerated: analysis.questions.length })
  } catch (err) {
    console.error("process-material error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Processing failed" },
      { status: 500 }
    )
  }
}
