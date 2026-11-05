// PATH: src/lib/ai/limits.ts
// Single place for every daily AI limit. Change numbers here only.

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
