import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { callGemini } from "@/lib/ai/gemini"

export const dynamic = "force-dynamic"

// Open /api/ai-check in your browser (while logged in) to test the AI connection.
// It shows exactly what is wrong if the AI is not working.
// You can delete this file when everything works.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Log in first, then open this page again." }, { status: 401 })
  }

  const result = await callGemini({
    parts: [{ text: "Reply with the single word: OK" }],
    maxOutputTokens: 50,
    timeoutMs: 20000,
  })

  return NextResponse.json({
    keyIsSet: Boolean(process.env.GEMINI_API_KEY),
    fallbackConfigured: Boolean(process.env.FALLBACK_LLM_API_KEY && process.env.FALLBACK_LLM_MODEL),
    ...(result.ok
      ? { working: true, modelUsed: result.model, reply: result.text.trim() }
      : { working: false, problem: result.error }),
  })
}
