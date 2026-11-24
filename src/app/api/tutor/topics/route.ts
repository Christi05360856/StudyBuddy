// PATH: src/app/api/tutor/topics/route.ts
import { NextRequest, NextResponse } from "next/server"
import { callGemini, parseJson } from "@/lib/ai/gemini"
import { createClient } from "@/lib/supabase/server"
import { providerBusyMessage } from "@/lib/ai/limits"
import { sharedRateLimit, logAiUsage } from "@/lib/ai/usage"

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Please log in again." }, { status: 401 })
    }

    // Validate first. Topic lists have no daily cap; only a burst limit against scripts.
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ topics: [], error: "Invalid request." }, { status: 400 })
    }
    const { materialTitle: rawTitle, context } = body as { materialTitle?: unknown; context?: unknown }
    const materialTitle = typeof rawTitle === "string" ? rawTitle.trim().slice(0, 200) : ""
    const notes = typeof context === "string" ? context.slice(0, 8000) : ""
    if (!materialTitle && !notes) {
      return NextResponse.json({ topics: [], error: "Material title or notes required." }, { status: 400 })
    }

    const burst = await sharedRateLimit(supabase, user.id, "topics-burst", 8, 60)
    if (!burst.ok) {
      return NextResponse.json(
        { topics: [], error: `Please wait ${burst.retryAfterSec} seconds and try again.` },
        { status: 429, headers: { "Retry-After": String(burst.retryAfterSec) } }
      )
    }

    const prompt = `You are helping a Nigerian university/polytechnic student study.

Material title: "${materialTitle || "Lecture notes"}"
${notes ? `\nNotes from the material:\n${notes}\n` : ""}
List the key topics covered in this material${notes ? "" : " (guess from the title)"}.
Return ONLY a JSON array of 5 to 12 short topic names, like:
["Introduction to Stacks", "Stack Operations", "Applications of Stacks"]`

    const result = await callGemini({
      parts: [{ text: prompt }],
      json: true,
      maxOutputTokens: 2048,
      timeoutMs: 25000,
    })

    if (!result.ok) {
      console.error("Topics error:", result.error)
      void logAiUsage(supabase, { feature: "topics", durationMs: Date.now() - t0, ok: false, errorCategory: "provider" })
      return NextResponse.json({ topics: [], error: providerBusyMessage() })
    }

    void logAiUsage(supabase, { feature: "topics", model: result.model, durationMs: Date.now() - t0, ok: true })
    const parsed = parseJson<unknown>(result.text)
    const topics = Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []

    return NextResponse.json({ topics })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ topics: [] })
  }
}
