// PATH: src/lib/ai/tutor-metrics.ts
/**
 * Phase 5 — Non-sensitive Tutor operational metrics.
 * Never log full prompts, notes, or student answers.
 */

export type TutorMetricEvent = {
  action: string
  level?: string
  durationMs: number
  ok: boolean
  retrievedChunks?: number
  hadBlocks?: boolean
  hadEvaluation?: boolean
  validationFailed?: boolean
  failureCategory?: string
}

export function logTutorMetric(event: TutorMetricEvent): void {
  try {
    // Structured one-liner for Vercel / platform logs
    console.info(
      JSON.stringify({
        type: "tutor_metric",
        ts: new Date().toISOString(),
        ...event,
      })
    )
  } catch {
    // never throw from metrics
  }
}

export function classifyTutorFailure(error: string): string {
  const e = error.toLowerCase()
  if (e.includes("quota") || e.includes("429") || e.includes("rate")) return "quota"
  if (e.includes("timeout") || e.includes("took too long") || e.includes("abort")) return "timeout"
  if (e.includes("json") || e.includes("parse")) return "validation"
  if (e.includes("401") || e.includes("403") || e.includes("auth")) return "auth"
  if (e.includes("network") || e.includes("fetch")) return "network"
  return "provider"
}
