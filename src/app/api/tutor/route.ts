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

const LEVEL_INSTRUCTIONS = {
  primary: `Explain like the student is in Primary 2. Use very simple words, short sentences, and everyday examples a child would understand. Avoid jargon. If you must use a technical word, explain it immediately in simple terms.`,
  normal: `Explain clearly at undergraduate level. Be concise and accurate.`,
  exam: `Explain in a way that prepares the student for exams. Use precise terminology, highlight what examiners look for, and give exam-style tips where useful.`,
}

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
      // Fail-open: log and continue so students can still use the tutor
    } else if (allowed === false) {
      return NextResponse.json({ error: limitReachedMessage("tutor") }, { status: 429 })
    }

    const body = await req.json()
    const {
      message,
      level = "primary",
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

    const levelKey = (level as keyof typeof LEVEL_INSTRUCTIONS) || "primary"
    const instruction = LEVEL_INSTRUCTIONS[levelKey] || LEVEL_INSTRUCTIONS.primary

    const recent: ChatMessage[] = Array.isArray(history) ? history.slice(-8) : []
    const transcript = recent
      .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${String(m.content).slice(0, 1500)}`)
      .join("\n\n")

    const notes = typeof context === "string" ? context.slice(0, 12000) : ""
    const name =
      typeof studentName === "string"
        ? studentName.replace(/[^a-zA-Z\u00C0-\u024F' -]/g, "").trim().slice(0, 30)
        : ""

    const nameRule = name
      ? firstMessage
        ? `The student's first name is ${name}. Start your reply with a short, warm greeting that uses their name, for example "Hello ${name},".`
        : `The student's first name is ${name}. Do not greet them again. Use their name only now and then.`
      : ""

    const topicLine =
      typeof topic === "string" && topic.trim()
        ? `The student is currently studying this topic: "${topic.trim()}". Stay focused on it unless they ask to change.`
        : ""

    const prompt = `You are a helpful study tutor for Nigerian university and polytechnic students.
${instruction}

Keep answers focused and not too long.
${nameRule}
${topicLine}

FORMATTING RULES:
- Use simple Markdown only: short headings with ##, **bold** for key terms, bullet lists with "-", numbered lists when useful.
- Keep paragraphs short and easy to scan.
- Do not use tables or HTML.
${notes ? `\nThe student's lecture notes (teach from these):\n${notes}\n` : ""}
${transcript ? `\nConversation so far:\n${transcript}\n` : ""}
Student: ${message}`

    const result = await callGemini({
      parts: [{ text: prompt }],
      maxOutputTokens: 4096,
      timeoutMs: 40000,
    })

    if (!result.ok) {
      console.error("Tutor error:", result.error)
      // Never show technical model names / codes to students
      return NextResponse.json({ error: providerBusyMessage() }, { status: 503 })
    }

    if (typeof materialId === "string" && materialId) {
      const topicKey =
        typeof topic === "string" && topic.trim() ? topic.trim().slice(0, 200) : "general"
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

    return NextResponse.json({ reply: result.text, model: result.model })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}
