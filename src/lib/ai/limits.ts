// PATH: src/lib/ai/limits.ts
// Single place for every daily AI limit. Change numbers here only.
// Tighter limits protect free-tier quota when many students use the app.

export const AI_LIMITS = {
  "process-material": 3, // quiz generation per user per day
  tutor: 20,             // tutor messages per user per day
  topics: 8,             // topic extraction calls per user per day
} as const

export type AiFeature = keyof typeof AI_LIMITS

/** Friendly message shown when the daily limit is hit. */
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

/** When the AI provider itself is out of quota (Gemini/Groq), not the per-user limit. */
export function providerBusyMessage(): string {
  return "The AI is busy right now (high demand). Please try again in a few minutes. Your quizzes and notes are still available."
}

/**
 * True when the daily-limit function is simply not set up in the database
 * (RPC missing). In that case the AI should still work.
 */
export function isMissingLimitSetup(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883"
}

/** Detect provider quota / rate limit errors from model replies. */
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
