// One shared helper for talking to the AI.
// Every AI feature (quiz, topics, tutor) uses this, so a fix here fixes all of them.
//
// Order of attempts:
//  1. Google Gemini (each model in MODELS)
//  2. On quota/429 OR if all Gemini models fail → fallback provider (Groq, OpenRouter, etc.)
//

const DEFAULT_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"]

function modelList(): string[] {
  const forced = process.env.GEMINI_MODEL?.trim()
  if (forced) return [forced, ...DEFAULT_MODELS.filter((m) => m !== forced)]
  return DEFAULT_MODELS
}

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } }

export type GeminiResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string }

type ReplyPart = { text?: string; thought?: boolean }

function shortError(body: string, status: number): string {
  try {
    const message = JSON.parse(body)?.error?.message
    if (message) return `${String(message).slice(0, 220)} (code ${status})`
  } catch {
    // not JSON
  }
  return `${body.slice(0, 220)} (code ${status})`
}

function isQuotaStatus(status: number, body: string): boolean {
  if (status === 429) return true
  const m = body.toLowerCase()
  return m.includes("quota") || m.includes("resource_exhausted") || m.includes("rate limit")
}

async function callFallback(options: {
  parts: GeminiPart[]
  json?: boolean
  maxOutputTokens?: number
  timeoutMs: number
}): Promise<GeminiResult | null> {
  const apiKey = process.env.FALLBACK_LLM_API_KEY
  const model = process.env.FALLBACK_LLM_MODEL?.trim()
  if (!apiKey || !model) return null

  // Backup providers only support text, not images/PDFs
  if (options.parts.some((p) => "inline_data" in p)) return null

  const baseUrl = (process.env.FALLBACK_LLM_BASE_URL || "https://api.groq.com/openai/v1").replace(
    /\/$/,
    ""
  )
  const prompt = options.parts.map((p) => ("text" in p ? p.text : "")).join("\n\n")

  const send = async (withJsonMode: boolean) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)
    try {
      return await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
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
    // Some providers reject JSON mode — retry once without it
    if (!res.ok && options.json && res.status === 400) {
      res = await send(false)
    }
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `fallback/${model}: ${shortError(body, res.status)}` }
    }
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    if (!text || typeof text !== "string") {
      return { ok: false, error: `fallback/${model}: empty reply` }
    }
    return { ok: true, text, model: `fallback:${model}` }
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `fallback/${model}: took too long`
        : `fallback/${model}: ${err instanceof Error ? err.message : "network error"}`
    return { ok: false, error: message }
  }
}

export async function callGemini(options: {
  parts: GeminiPart[]
  json?: boolean
  maxOutputTokens?: number
  timeoutMs?: number
}): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY
  const errors: string[] = []
  const deadline = Date.now() + (options.timeoutMs ?? 55000)
  let sawQuota = false

  if (apiKey) {
    for (const model of modelList()) {
      const remaining = deadline - Date.now()
      if (remaining < 3000) break

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.min(remaining, 28000))

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
          const message = `${model}: ${shortError(body, res.status)}`
          errors.push(message)
          console.error("Gemini error:", message)
          if (isQuotaStatus(res.status, body)) {
            sawQuota = true
            break // no point trying other Gemini models on the same key
          }
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
          const message = `${model}: empty reply (${candidate?.finishReason ?? "no reason"})`
          errors.push(message)
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
  } else {
    errors.push("GEMINI_API_KEY not set")
  }

  const fallback = await callFallback({
    parts: options.parts,
    json: options.json,
    maxOutputTokens: options.maxOutputTokens,
    timeoutMs: Math.max(8000, Math.min(25000, deadline - Date.now())),
  })
  if (fallback?.ok) return fallback
  if (fallback && !fallback.ok) errors.push(fallback.error)

  if (sawQuota && !process.env.FALLBACK_LLM_API_KEY) {
    return {
      ok: false,
      error:
        "AI quota reached and no backup provider is configured. Add FALLBACK_LLM_API_KEY (e.g. Groq) on Vercel.",
    }
  }

  return { ok: false, error: errors.slice(-3).join(" | ") || "Unknown AI error" }
}

export function parseJson<T>(text: string): T | null {
  try {
    const clean = text
      .replace(/^\s*```(?:json)?/i, "")
      .replace(/```\s*$/, "")
      .trim()
    return JSON.parse(clean) as T
  } catch {
    return null
  }
}
