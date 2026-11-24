// PATH: src/lib/ai/limits.ts
// Single place for every daily AI limit. Change numbers here only.
import type { SupabaseClient } from "@supabase/supabase-js"

export const AI_LIMITS = {
  "process-material": 3,
  tutor: 20,
  topics: 8,
} as const

export type AiFeature = keyof typeof AI_LIMITS

export function limitReachedMessage(feature: AiFeature): string {
  const limit = AI_LIMITS[feature]
  if (feature === "tutor") {
    return `You've used your ${limit} AI tutor messages for today. Come back after midnight — or keep studying with your saved quizzes.`
  }
  if (feature === "process-material") {
    return `You've generated quizzes for ${limit} materials today. You can still take existing quizzes and use materials already processed.`
  }
  return `Daily limit reached (${limit}). It resets at midnight.`
}

export function providerBusyMessage(): string {
  return "The AI is busy right now (high demand). Please try again in a few minutes. Your quizzes and notes are still available."
}

/**
 * True when the daily-limit RPC is missing or broken.
 * In that case AI features should still work (fail-open).
 */
export function isMissingLimitSetup(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  const code = error.code ?? ""
  if (code === "PGRST202" || code === "42883") return true
  if (code === "PGRST203" || code === "42501" || code === "42725") return true
  const msg = (error.message ?? "").toLowerCase()
  if (msg.includes("consume_ai_credit") && (msg.includes("not exist") || msg.includes("could not find"))) {
    return true
  }
  return false
}

export type CreditCheck = { ok: true } | { ok: false; status: number; message: string }

/**
 * Uses one daily AI credit. Call this AFTER the request has been validated,
 * so bad requests never cost a credit.
 *  - limit reached            -> 429
 *  - limit setup not deployed -> allowed (logged), so the app keeps working
 *  - any other database error -> 503 (fails closed, never silently unlimited)
 */
export async function checkAiCredit(
  supabase: SupabaseClient,
  feature: AiFeature
): Promise<CreditCheck> {
  const { data, error } = await supabase.rpc("consume_ai_credit", {
    feature,
    daily_limit: AI_LIMITS[feature],
  })
  if (error) {
    if (isMissingLimitSetup(error)) {
      console.error(`consume_ai_credit missing/not allowed (${feature}) — limits NOT enforced:`, error)
      return { ok: true }
    }
    console.error(`consume_ai_credit error (${feature}):`, error)
    return {
      ok: false,
      status: 503,
      message: "We could not check your daily limit right now. Please try again in a moment.",
    }
  }
  if (data === false) {
    return { ok: false, status: 429, message: limitReachedMessage(feature) }
  }
  return { ok: true }
}

// Best-effort burst limiter (per server instance). The daily credit is the hard limit.
const buckets = new Map<string, number[]>()

export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now()
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= max) {
    buckets.set(key, recent)
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) }
  }
  recent.push(now)
  buckets.set(key, recent)
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.length === 0 || now - v[v.length - 1] > windowMs) buckets.delete(k)
    }
  }
  return { ok: true, retryAfterSec: 0 }
}

export function isProviderQuotaError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes("quota") ||
    m.includes("rate limit") ||
    m.includes("resource_exhausted") ||
    m.includes("429") ||
    m.includes("exceeded") ||
    m.includes("too many requests")
  )
}
