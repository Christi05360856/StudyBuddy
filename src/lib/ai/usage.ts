// PATH: src/lib/ai/usage.ts
// Usage accounting and abuse protection.
//   - NEVER decides whether a student may keep learning because a counter failed:
//     every helper here fails OPEN (and logs) when the database function is unreachable.
//   - Authentication and ownership are checked by the routes themselves, not here.
import type { SupabaseClient } from "@supabase/supabase-js"
import { rateLimit as localRateLimit, AI_LIMITS, type AiFeature } from "./limits"

export type RateResult = { ok: boolean; retryAfterSec: number }

/** Shared (database) burst limiter. If the database function fails, a per-server limiter takes over. */
export async function sharedRateLimit(
  supabase: SupabaseClient,
  userId: string,
  bucket: string,
  max: number,
  windowSec: number
): Promise<RateResult> {
  try {
    const { data, error } = await supabase.rpc("ai_check_rate_limit", {
      p_bucket: bucket,
      p_max: max,
      p_window_seconds: windowSec,
    })
    if (!error && data && typeof data === "object") {
      const d = data as { allowed?: boolean; retry_after?: number }
      return { ok: d.allowed !== false, retryAfterSec: Number(d.retry_after) || 0 }
    }
    console.error("ai_check_rate_limit failed, using local limiter:", error?.code, error?.message)
  } catch (err) {
    console.error("ai_check_rate_limit threw, using local limiter:", err)
  }
  return localRateLimit(`${bucket}:${userId}`, max, windowSec * 1000)
}

export type Slot = { ok: boolean; release: () => Promise<void> }

/** Limits how many answers one student can have being written at the same moment. */
export async function acquireGenerationSlot(
  supabase: SupabaseClient,
  max: number,
  ttlSec = 90
): Promise<Slot> {
  const none = async () => {}
  try {
    const { data, error } = await supabase.rpc("ai_acquire_slot", {
      p_max: max,
      p_ttl_seconds: ttlSec,
    })
    if (error) {
      console.error("ai_acquire_slot failed, allowing:", error.code, error.message)
      return { ok: true, release: none }
    }
    if (data === null || data === undefined) return { ok: false, release: none }
    const id = String(data)
    return {
      ok: true,
      release: async () => {
        try {
          await supabase.rpc("ai_release_slot", { p_id: id })
        } catch {
          // the slot expires by itself
        }
      },
    }
  } catch (err) {
    console.error("ai_acquire_slot threw, allowing:", err)
    return { ok: true, release: none }
  }
}

export type UsageEntry = {
  feature: string
  model?: string | null // "fallback:xyz" for the backup provider
  inputTokens?: number | null
  outputTokens?: number | null
  durationMs?: number
  ok: boolean
  errorCategory?: string | null
}

function estimateCostUsd(input?: number | null, output?: number | null): number | null {
  // Optional: set AI_COST_USD_PER_M_INPUT and AI_COST_USD_PER_M_OUTPUT on Vercel to get cost estimates
  const inRate = parseFloat(process.env.AI_COST_USD_PER_M_INPUT ?? "")
  const outRate = parseFloat(process.env.AI_COST_USD_PER_M_OUTPUT ?? "")
  if (!Number.isFinite(inRate) || !Number.isFinite(outRate)) return null
  if (input == null && output == null) return null
  return ((input ?? 0) * inRate + (output ?? 0) * outRate) / 1_000_000
}

/** Records one AI call. Never throws and never blocks the student. */
export async function logAiUsage(supabase: SupabaseClient, e: UsageEntry): Promise<void> {
  try {
    const fallback = Boolean(e.model?.startsWith("fallback:"))
    const model = e.model ? e.model.replace(/^fallback:/, "") : null
    const { error } = await supabase.rpc("ai_log_usage", {
      p_feature: e.feature,
      p_provider: e.model ? (fallback ? "fallback" : "gemini") : null,
      p_model: model,
      p_input_tokens: e.inputTokens ?? null,
      p_output_tokens: e.outputTokens ?? null,
      p_duration_ms: e.durationMs != null ? Math.round(e.durationMs) : null,
      p_ok: e.ok,
      p_error_category: e.errorCategory ?? null,
      p_fallback: fallback,
      p_est_cost: estimateCostUsd(e.inputTokens, e.outputTokens),
    })
    if (error) console.warn("ai_log_usage failed:", error.code, error.message)
  } catch (err) {
    console.warn("ai_log_usage threw:", err)
  }
}

/**
 * Read-only check for features that keep a daily allowance (material processing).
 * Only SUCCESSFUL runs are counted, so failures never use up the allowance.
 * If the check itself fails the student is allowed through (and it is logged).
 */
export async function checkDailyAllowance(
  supabase: SupabaseClient,
  feature: AiFeature
): Promise<{ allowed: boolean; used: number | null }> {
  try {
    const { data, error } = await supabase.rpc("ai_successful_uses_today", { p_feature: feature })
    if (error) {
      console.error("ai_successful_uses_today failed, allowing:", error.code, error.message)
      return { allowed: true, used: null }
    }
    const used = Number(data) || 0
    return { allowed: used < AI_LIMITS[feature], used }
  } catch (err) {
    console.error("ai_successful_uses_today threw, allowing:", err)
    return { allowed: true, used: null }
  }
}
