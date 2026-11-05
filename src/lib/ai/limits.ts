// PATH: src/lib/ai/limits.ts
// Single place for every daily AI limit. Change numbers here only.

export const AI_LIMITS = {
  "process-material": 7,
  tutor: 40,
  topics: 20,
} as const

export type AiFeature = keyof typeof AI_LIMITS

/** Friendly message shown when the daily limit is hit. */
export function limitReachedMessage(feature: AiFeature): string {
  const limit = AI_LIMITS[feature]
  return `You have used ${limit} of ${limit} today. It resets at midnight.`
}
