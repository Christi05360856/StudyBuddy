// PATH: src/app/api/tutor/topics/route.ts
import { NextRequest, NextResponse } from "next/server"
import { callGemini, parseJson } from "@/lib/ai/gemini"
import { createClient } from "@/lib/supabase/server"
import { checkAiCredit, rateLimit, providerBusyMessage } from "@/lib/ai/limits"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Please log in again." }, { status: 401 })
    }

    // Validate first, so a bad request never costs a credit
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

    const burst = rateLimit(`topics:${user.id}`, 6, 60_000)
    if (!burst.ok) {
      return NextResponse.json(
        { topics: [], error: `Please wait ${burst.retryAfterSec} seconds and try again.` },
        { status: 429, headers: { "Retry-After": String(burst.retryAfterSec) } }
      )
    }
    const credit = await checkAiCredit(supabase, "topics")
    if (!credit.ok) {
      return NextResponse.json({ topics: [], error: credit.message }, { status: credit.status })
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
      return NextResponse.json({ topics: [], error: providerBusyMessage() })
    }

    const parsed = parseJson<unknown>(result.text)
    const topics = Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []

    return NextResponse.json({ topics })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ topics: [] })
  }
}
