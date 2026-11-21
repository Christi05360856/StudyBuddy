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

    // Daily limit — fail OPEN so a broken RPC never blocks the tutor
    const { data: allowed, error: creditError } = await supabase.rpc("consume_ai_credit", {
      feature: "tutor",
      daily_limit: AI_LIMITS.tutor,
    })
    if (creditError) {
      console.error("consume_ai_credit error:", creditError)
      if (!isMissingLimitSetup(creditError)) {
        // still fail-open
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

    const notes = typeof context === "string" ? context.slice(0, 18000) : ""
    const name =
      typeof studentName === "string"
        ? studentName.replace(/[^a-zA-Z\u00C0-\u024F' -]/g, "").trim().slice(0, 30)
        : ""
    const topicStr =
      typeof topic === "string" && topic.trim() ? topic.trim().slice(0, 200) : ""

    const userContent = buildTutorUserContent({
      message: message.trim(),
      notes,
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

    // Backward-compatible contract for the current UI
    return NextResponse.json({
      reply: result.text,
      model: result.model,
      level: teachingLevel,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
