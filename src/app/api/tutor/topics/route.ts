// PATH: src/app/api/tutor/topics/route.ts
import { NextRequest, NextResponse } from "next/server"
import { callGemini, parseJson } from "@/lib/ai/gemini"
import { createClient } from "@/lib/supabase/server"
import {
  AI_LIMITS,
  limitReachedMessage,
  isMissingLimitSetup,
  providerBusyMessage,
  isProviderQuotaError,
} from "@/lib/ai/limits"

// Backup route: only used when a material has no saved topics yet
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
      feature: "topics",
      daily_limit: AI_LIMITS.topics,
    })
    if (creditError) {
      console.error("consume_ai_credit error:", creditError)
      if (!isMissingLimitSetup(creditError)) {
        return NextResponse.json(
          { topics: [], error: "Could not check usage limit. Please try again." },
          { status: 500 }
        )
      }
    } else if (allowed === false) {
      return NextResponse.json(
        { topics: [], error: limitReachedMessage("topics") },
        { status: 429 }
      )
    }

    const { materialTitle, context } = await req.json()

    const notes = typeof context === "string" ? context.slice(0, 8000) : ""

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
      const friendly = isProviderQuotaError(result.error)
        ? providerBusyMessage()
        : providerBusyMessage()
      return NextResponse.json({ topics: [], error: friendly })
    }

    const parsed = parseJson<unknown>(result.text)
    const topics = Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []

    return NextResponse.json({ topics })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ topics: [] })
  }
}
