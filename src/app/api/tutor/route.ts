// PATH: src/app/api/tutor/route.ts
import { NextRequest, NextResponse } from "next/server"
import { callGemini } from "@/lib/ai/gemini"
import { createClient } from "@/lib/supabase/server"
import {
  AI_LIMITS,
  limitReachedMessage,
  isMissingLimitSetup,
  providerBusyMessage,
} from "@/lib/ai/limits"
import {
  buildTutorSystemInstruction,
  buildTutorUserContent,
  normalizeLevel,
} from "@/lib/ai/tutor-policy"
import { formatChunksForTutor, retrieveMaterialChunks } from "@/lib/ai/retrieval"

type ChatMessage = { role: "user" | "assistant"; content: string }

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Please log in again." }, { status: 401 })
    }

    const { data: allowed, error: creditError } = await supabase.rpc("consume_ai_credit", {
      feature: "tutor",
      daily_limit: AI_LIMITS.tutor,
    })
    if (creditError) {
      console.error("consume_ai_credit error:", creditError)
      if (!isMissingLimitSetup(creditError)) {
        // fail-open
      }
    } else if (allowed === false) {
      return NextResponse.json({ error: limitReachedMessage("tutor") }, { status: 429 })
    }

    const body = await req.json()
    const {
      message,
      level = "standard",
      context,
      history,
      studentName,
      firstMessage,
      materialId,
      topic,
    } = body

    if (!message || typeof message !== "string" || message.length > 4000) {
      return NextResponse.json({ error: "message required" }, { status: 400 })
    }

    const teachingLevel = normalizeLevel(level)
    const systemInstruction = buildTutorSystemInstruction(teachingLevel)

    const recent: ChatMessage[] = Array.isArray(history) ? history.slice(-10) : []
    const transcript = recent
      .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${String(m.content).slice(0, 1500)}`)
      .join("\n\n")

    const summaryNotes = typeof context === "string" ? context.slice(0, 8000) : ""
    const topicStr =
      typeof topic === "string" && topic.trim() ? topic.trim().slice(0, 200) : ""
    const name =
      typeof studentName === "string"
        ? studentName.replace(/[^a-zA-Z\u00C0-\u024F' -]/g, "").trim().slice(0, 30)
        : ""

    // Phase 2: pull original passages when materialId is present
    let sourceBlock = ""
    let retrievalCount = 0
    if (typeof materialId === "string" && materialId) {
      // Ownership check — only retrieve for materials the student owns (RLS also enforces)
      const { data: mat } = await supabase
        .from("materials")
        .select("id")
        .eq("id", materialId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (mat) {
        const query = [topicStr, message].filter(Boolean).join(" ").slice(0, 300)
        const chunks = await retrieveMaterialChunks(supabase, {
          materialId,
          query,
          limit: 6,
        })
        retrievalCount = chunks.length
        sourceBlock = formatChunksForTutor(chunks)
      }
    }

    // Prefer original passages; keep a short summary only as secondary context
    let notesForTutor = ""
    if (sourceBlock) {
      notesForTutor =
        sourceBlock +
        (summaryNotes
          ? `\n\n[Study summary — secondary; prefer the passages above if they conflict in wording]\n${summaryNotes.slice(0, 2500)}`
          : "")
    } else {
      notesForTutor = summaryNotes
    }

    const userContent = buildTutorUserContent({
      message: message.trim(),
      notes: notesForTutor,
      topic: topicStr,
      transcript,
      studentName: name,
      firstMessage: Boolean(firstMessage),
      userTurns: recent.filter((m) => m.role === "user").length,
    })

    const result = await callGemini({
      systemInstruction,
      parts: [{ text: userContent }],
      maxOutputTokens: 6144,
      timeoutMs: 50000,
    })

    if (!result.ok) {
      console.error("Tutor error:", result.error)
      return NextResponse.json({ error: providerBusyMessage() }, { status: 503 })
    }

    if (typeof materialId === "string" && materialId) {
      const topicKey = topicStr || "general"
      const rows = [
        {
          user_id: user.id,
          material_id: materialId,
          topic: topicKey,
          role: "user" as const,
          content: message.slice(0, 8000),
        },
        {
          user_id: user.id,
          material_id: materialId,
          topic: topicKey,
          role: "assistant" as const,
          content: result.text.slice(0, 16000),
        },
      ]
      const { error: saveError } = await supabase.from("tutor_messages").insert(rows)
      if (saveError) {
        console.error("tutor_messages save:", saveError.message)
      }
    }

    return NextResponse.json({
      reply: result.text,
      model: result.model,
      level: teachingLevel,
      retrievedChunks: retrievalCount,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
