// One shared helper for talking to the AI.
// Every AI feature (quiz, topics, tutor) uses this, so a fix here fixes all of them.
//
// Order of attempts:
//  1. Google Gemini, trying each model in MODELS until one answers.
//  2. (Optional) a backup provider, only if you set the FALLBACK_LLM_* variables.
//     It works with Groq, Cerebras, OpenRouter, Hugging Face router, or any
//     service that speaks the OpenAI "chat/completions" format.

// You can force a model by adding GEMINI_MODEL in Vercel -> Environment Variables.
const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } }

export type GeminiResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string }

type ReplyPart = { text?: string; thought?: boolean }

// Turns Google's long error reply into one short readable line
function shortError(body: string, status: number): string {
  try {
    const message = JSON.parse(body)?.error?.message
    if (message) return `${String(message).slice(0, 220)} (code ${status})`
  } catch {
    // not JSON, fall through
  }
  return `${body.slice(0, 220)} (code ${status})`
}

// ---------- Backup provider (OpenAI-compatible) ----------

async function callFallback(options: {
  parts: GeminiPart[]
  json?: boolean
  maxOutputTokens?: number
  timeoutMs: number
}): Promise<GeminiResult | null> {
  const apiKey = process.env.FALLBACK_LLM_API_KEY
  const model = process.env.FALLBACK_LLM_MODEL?.trim()
  if (!apiKey || !model) return null // not configured

  // The backup can only read text, not PDFs or photos
  if (options.parts.some((p) => "inline_data" in p)) return null

  const baseUrl = (process.env.FALLBACK_LLM_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "")
  const prompt = options.parts.map((p) => ("text" in p ? p.text : "")).join("\n\n")

  const send = async (withJsonMode: boolean) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)
    try {
      return await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: Math.min(options.maxOutputTokens ?? 4096, 8192),
          ...(withJsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  try {
    let res = await send(Boolean(options.json))
    // Some providers do not support JSON mode. Try once more without it.
    if (res.status === 400 && options.json) res = await send(false)

    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `backup AI ${model}: ${shortError(body, res.status)}` }
    }
    const data = await res.json()
    const text: string = data?.choices?.[0]?.message?.content ?? ""
    if (!text.trim()) return { ok: false, error: `backup AI ${model}: empty reply` }
    return { ok: true, text, model: `fallback:${model}` }
  } catch (err) {
    return {
      ok: false,
      error: `backup AI ${model}: ${err instanceof Error && err.name === "AbortError" ? "took too long" : err instanceof Error ? err.message : "network error"}`,
    }
  }
}

// ---------- Main entry ----------

export async function callGemini(options: {
  parts: GeminiPart[]
  json?: boolean
  maxOutputTokens?: number
  /** Total time allowed for ALL attempts together (not per model) */
  timeoutMs?: number
}): Promise<GeminiResult> {
  const totalMs = options.timeoutMs ?? 50000
  const deadline = Date.now() + totalMs
  const apiKey = process.env.GEMINI_API_KEY
  const errors: string[] = []

  if (!apiKey) {
    errors.push("GEMINI_API_KEY is not set in Vercel")
  } else {
    const custom = process.env.GEMINI_MODEL?.trim()
    const models = custom ? [custom, ...MODELS.filter((m) => m !== custom)] : MODELS

    for (const model of models) {
      // Keep some time for the backup provider, and never start an attempt with almost no time left
      const remaining = deadline - Date.now()
      if (remaining < 6000) break

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), remaining)

      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              contents: [{ role: "user", parts: options.parts }],
              generationConfig: {
                maxOutputTokens: options.maxOutputTokens ?? 8192,
                ...(options.json ? { responseMimeType: "application/json" } : {}),
              },
            }),
            signal: controller.signal,
          }
        )

        if (!res.ok) {
          const body = await res.text()
          const message = `${model}: ${shortError(body, res.status)}`
          errors.push(message)
          console.error("Gemini error:", message)
          // A bad key fails on every Gemini model, so skip the rest of them
          if (res.status === 401 || res.status === 403) break
          continue
        }

        const data = await res.json()
        const candidate = data?.candidates?.[0]
        const parts: ReplyPart[] = candidate?.content?.parts ?? []
        const text = parts
          .filter((p) => p.text && !p.thought)
          .map((p) => p.text)
          .join("")

        if (!text) {
          const message = `${model}: empty reply (${candidate?.finishReason ?? "no reason given"})`
          errors.push(message)
          console.error("Gemini error:", message)
          continue
        }

        return { ok: true, text, model }
      } catch (err) {
        const message =
          err instanceof Error && err.name === "AbortError"
            ? `${model}: took too long to answer`
            : `${model}: ${err instanceof Error ? err.message : "network error"}`
        errors.push(message)
        console.error("Gemini error:", message)
      } finally {
        clearTimeout(timer)
      }
    }
  }

  // Backup provider (only if configured and the request is text-only)
  const fallback = await callFallback({
    parts: options.parts,
    json: options.json,
    maxOutputTokens: options.maxOutputTokens,
    timeoutMs: Math.max(8000, Math.min(25000, deadline - Date.now())),
  })
  if (fallback?.ok) return fallback
  if (fallback && !fallback.ok) errors.push(fallback.error)

  return { ok: false, error: errors.slice(-3).join(" | ") || "Unknown AI error" }
}

// Reads JSON from the AI reply (removes ```json fences if the AI added them)
export function parseJson<T>(text: string): T | null {
  try {
    const clean = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim()
    return JSON.parse(clean) as T
  } catch {
    return null
  }
}
