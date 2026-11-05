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

/**
 * True when the daily-limit function is simply not set up in the database
 * (supabase-update-1.sql not run). PostgREST reports a missing function as
 * PGRST202, plain Postgres as 42883. In that case the AI should still work.
 */
export function isMissingLimitSetup(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883"
}
