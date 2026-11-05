// One shared helper for talking to Google Gemini.
// Every AI feature (quiz, topics, tutor) uses this, so a fix here fixes all of them.

// Models are tried in this order. If the first one fails, the next is tried.
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

export async function callGemini(options: {
  parts: GeminiPart[]
  json?: boolean
  maxOutputTokens?: number
  timeoutMs?: number
}): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY is not set in Vercel" }
  }

  const custom = process.env.GEMINI_MODEL?.trim()
  const models = custom ? [custom, ...MODELS.filter((m) => m !== custom)] : MODELS
  let lastError = "Unknown AI error"

  for (const model of models) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 50000)

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
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
        lastError = `${model}: ${shortError(body, res.status)}`
        console.error("Gemini error:", lastError)
        // A bad key will fail on every model, so stop early
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
        lastError = `${model}: empty reply (${candidate?.finishReason ?? "no reason given"})`
        console.error("Gemini error:", lastError)
        continue
      }

      return { ok: true, text, model }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        lastError = `${model}: took too long to answer`
        break
      }
      lastError = `${model}: ${err instanceof Error ? err.message : "network error"}`
      console.error("Gemini error:", lastError)
    } finally {
      clearTimeout(timer)
    }
  }

  return { ok: false, error: lastError }
}

// Reads JSON from the AI reply (removes ```json fences if the AI added them)
export function parseJson<T>(text: string): T | null {
  try {
    const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
    return JSON.parse(clean) as T
  } catch {
    return null
  }
}
