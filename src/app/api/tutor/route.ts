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
  primary: `Explain simply, like a patient senior classmate. Short sentences, everyday Nigerian examples where they help. If you use a technical word, define it in plain English right away.`,
  normal: `Explain clearly at undergraduate / polytechnic level. Be accurate, structured, and practical.`,
  exam: `Teach for exams. Use precise terms, flag what examiners usually ask, give exam-style tips, and show how marks are often awarded for steps (especially calculations).`,
}

type ChatMessage = { role: "user" | "assistant"; content: string }

const TEACHING_RULES = `
TEACHING RULES (follow every reply):
1. Ground every explanation in the student's lecture notes below when notes are provided. Do not invent facts that are not supported by the notes. If the notes are thin on a point, say so and teach carefully from what is there.
2. Structure long answers: short opening, then clear steps or bullets, then a brief check that they understood.
3. Calculations and formulas:
   - State the formula and what each symbol means.
   - Work through at least one full example step by step (show intermediate values), using plain text formulas only (no LaTeX).
   - Then give 2 or 3 short practice questions based on the same material for the student to try.
   - After practice questions, do NOT reveal the full answers unless the student asks or sends their attempt. You may give a small hint if they are stuck.
4. When the student asks you to "teach", "explain", or starts a topic: cover the main ideas in the notes for that topic — definitions, why it matters, procedure, common mistakes, and a quick example.
5. You cannot draw real pictures. For diagrams: describe them clearly in words (boxes, arrows, axes) or use simple Markdown structure. For graphs, say what is on each axis and what the shape means.
6. MATH AND FORMULAS — never use LaTeX or dollar signs ($ ... $). Write plain text only, for example:
   - CPU Time = (Instruction Count × CPI) / Clock Frequency
   - 10^9 instructions, 2 GHz, 4 seconds
   Use × ÷ and ^ for powers. Students read on phones; raw LaTeX confuses them.
7. Keep answers focused. Prefer one solid explanation over a long essay. Use ## headings and **bold** for key terms. No HTML or tables.
8. Nigerian university / polytechnic context: clear English is fine; avoid slang in exam mode.
`.trim()

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
        // Still fail-open for other RPC glitches so study is not blocked
      }
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

    // More note context so teaching can cover the material properly
    const notes = typeof context === "string" ? context.slice(0, 18000) : ""
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

    const prompt = `You are StudyBuddy's AI tutor for Nigerian university and polytechnic students.
Your job is to make sure the student understands their own class materials.

LEVEL:
${instruction}

${TEACHING_RULES}

${nameRule}
${topicLine}

${notes ? `STUDENT LECTURE NOTES (primary source — teach from these):\n${notes}\n` : "No lecture notes were attached. Teach carefully and say when you need their notes.\n"}
${transcript ? `Conversation so far:\n${transcript}\n` : ""}
Student: ${message}`

    const result = await callGemini({
      parts: [{ text: prompt }],
      maxOutputTokens: 6144,
      timeoutMs: 50000,
    })

    if (!result.ok) {
      console.error("Tutor error:", result.error)
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
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
