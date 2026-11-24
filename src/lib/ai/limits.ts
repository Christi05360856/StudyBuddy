// PATH: src/lib/ai/limits.ts
// Fair-use settings. The Tutor has NO daily message cap: students can study for hours.
// Only material processing (expensive) keeps a daily allowance, and only SUCCESSFUL runs count.

export const AI_LIMITS = {
  "process-material": 3,
} as const

export type AiFeature = keyof typeof AI_LIMITS

/**
 * Abuse protection for the Tutor. Normal studying is far below these numbers;
 * a script firing requests is not. Change numbers here only.
 */
export const TUTOR_PROTECTION = {
  burstMax: 12, // messages...
  burstWindowSec: 60, // ...per minute
  hourMax: 180, // messages per hour (about one every 20 seconds, non-stop)
  hourWindowSec: 3600,
  concurrent: 2, // answers being written at the same moment (two tabs is fine)
} as const

/**
 * Kept ONLY so files from the previous update still compile while you commit one file at a time.
 * The daily credit counter no longer exists, so this always allows. Delete it after all files are in.
 */
export type CreditCheck = { ok: true } | { ok: false; status: number; message: string }
export async function checkAiCredit(_supabase: unknown, _feature: string): Promise<CreditCheck> {
  return { ok: true }
}

export function limitReachedMessage(feature: AiFeature): string {
  const limit = AI_LIMITS[feature]
  return `You've generated quizzes for ${limit} materials today. You can still take existing quizzes and use materials already processed. It resets at midnight.`
}

export function providerBusyMessage(): string {
  return "The AI tutor is temporarily busy. Your message is still in the box — please try again in a moment. Your lesson and progress are saved."
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

// Per-server backup limiter, used only when the shared (database) limiter cannot be reached
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
