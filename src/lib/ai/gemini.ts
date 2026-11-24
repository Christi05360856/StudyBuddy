// One shared helper for talking to the AI.
// Every AI feature (quiz, topics, tutor) uses this, so a fix here fixes all of them.
//
// Order of attempts:
//  1. Google Gemini (each model in DEFAULT_MODELS)
//  2. On quota/429 OR if all Gemini models fail → fallback provider (Groq, etc.)
//
// Models (Nov 2026):
//   gemini-2.0-* and gemini-1.5-* are shut down.
//   llama-3.3-70b-versatile on Groq is Enterprise-only.
//   Free Groq models: openai/gpt-oss-20b, openai/gpt-oss-120b

const DEFAULT_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
]

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
  systemInstruction?: string
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
  const bodyText = options.parts.map((p) => ("text" in p ? p.text : "")).join("\n\n")
  const prompt = options.systemInstruction
    ? `${options.systemInstruction}\n\n---\n\n${bodyText}`
    : bodyText

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
  /** Persistent system instruction (Gemini systemInstruction field). */
  systemInstruction?: string
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
              ...(options.systemInstruction
                ? {
                    systemInstruction: {
                      parts: [{ text: options.systemInstruction }],
                    },
                  }
                : {}),
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
            break // same key — no point trying other Gemini models
          }
          // 404 = model retired; try next model
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
    systemInstruction: options.systemInstruction,
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

  // Keep technical detail in logs only — callers should show a friendly message
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

// ---------------------------------------------------------------------------
// Streaming: the answer arrives piece by piece, so the student starts reading at once.
// ---------------------------------------------------------------------------

export type GeminiStreamResult =
  | { ok: true; model: string; chunks: AsyncGenerator<string, void, undefined> }
  | { ok: false; error: string }

function textFromEvent(ev: string): string {
  const data = ev
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .join("")
  if (!data || data === "[DONE]") return ""
  try {
    const parts: ReplyPart[] = JSON.parse(data)?.candidates?.[0]?.content?.parts ?? []
    return parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("")
  } catch {
    return ""
  }
}

/**
 * Same models and fallbacks as callGemini, but the text comes back as a stream.
 * The first piece is read BEFORE returning, so a failing model is skipped just like before.
 * If every Gemini model fails, the backup provider answers in one piece.
 */
export async function streamGemini(options: {
  parts: GeminiPart[]
  maxOutputTokens?: number
  timeoutMs?: number
  systemInstruction?: string
}): Promise<GeminiStreamResult> {
  const apiKey = process.env.GEMINI_API_KEY
  const errors: string[] = []
  const deadline = Date.now() + (options.timeoutMs ?? 40000)
  let sawQuota = false

  if (apiKey) {
    for (const model of modelList()) {
      const remaining = deadline - Date.now()
      if (remaining < 3000) break

      // One timer covers the whole answer, including the part still being streamed
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), remaining)
      const stop = () => clearTimeout(timer)

      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              contents: [{ role: "user", parts: options.parts }],
              ...(options.systemInstruction
                ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } }
                : {}),
              generationConfig: { maxOutputTokens: options.maxOutputTokens ?? 8192 },
            }),
            signal: controller.signal,
          }
        )

        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => "")
          const message = `${model}: ${shortError(body, res.status)}`
          errors.push(message)
          console.error("Gemini stream error:", message)
          stop()
          if (isQuotaStatus(res.status, body)) {
            sawQuota = true
            break
          }
          if (res.status === 401 || res.status === 403) break
          continue
        }

        // Read until the first piece of text arrives
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        const firstTexts: string[] = []
        let ended = false
        while (firstTexts.length === 0 && !ended) {
          const { done, value } = await reader.read()
          if (done) {
            ended = true
            break
          }
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n")
          const events = buffer.split("\n\n")
          buffer = events.pop() ?? ""
          for (const ev of events) {
            const text = textFromEvent(ev)
            if (text) firstTexts.push(text)
          }
        }
        if (firstTexts.length === 0) {
          errors.push(`${model}: empty reply`)
          stop()
          continue
        }

        // Hand the rest of the stream over, starting with what is already read
        async function* continued(): AsyncGenerator<string, void, undefined> {
          try {
            for (const piece of firstTexts) yield piece
            let carry = buffer
            while (!ended) {
              const { done, value } = await reader.read()
              if (done) break
              carry += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n")
              const events = carry.split("\n\n")
              carry = events.pop() ?? ""
              for (const ev of events) {
                const text = textFromEvent(ev)
                if (text) yield text
              }
            }
            const tail = textFromEvent(carry)
            if (tail) yield tail
          } finally {
            stop()
          }
        }
        return { ok: true, model, chunks: continued() }
      } catch (err) {
        stop()
        const message =
          err instanceof Error && err.name === "AbortError"
            ? `${model}: took too long to answer`
            : `${model}: ${err instanceof Error ? err.message : "network error"}`
        errors.push(message)
        console.error("Gemini stream error:", message)
      }
    }
  } else {
    errors.push("GEMINI_API_KEY not set")
  }

  // Backup provider answers in one piece
  const fallback = await callFallback({
    parts: options.parts,
    json: false,
    maxOutputTokens: options.maxOutputTokens,
    timeoutMs: Math.max(8000, Math.min(25000, deadline - Date.now())),
    systemInstruction: options.systemInstruction,
  })
  if (fallback?.ok) {
    const text = fallback.text
    const model = fallback.model
    async function* single(): AsyncGenerator<string, void, undefined> {
      yield text
    }
    return { ok: true, model, chunks: single() }
  }
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
