// PATH: src/lib/streak.ts
/**
 * Streak calculation with one forgiven missed day per rolling window.
 * All dates are Africa/Lagos calendar days.
 */

/** Returns the current streak length (0 if none). */
export function computeStreak(days: string[]): number {
  if (days.length === 0) return 0

  const sorted = [...new Set(days)].sort((a, b) => (a < b ? 1 : -1))

  const today = lagosToday()
  const yesterday = addDays(today, -1)

  // Must have studied today or yesterday to have an active streak
  if (sorted[0] !== today && sorted[0] !== yesterday) return 0

  let streak = 0
  let cursor = sorted[0] === today ? today : yesterday
  let forgiven = false

  for (const d of sorted) {
    if (d === cursor) {
      streak++
      cursor = addDays(cursor, -1)
      continue
    }

    // Gap of exactly one day → use the forgiveness if still available
    if (!forgiven && d === addDays(cursor, -1)) {
      forgiven = true
      streak++
      cursor = addDays(d, -1)
      continue
    }

    break
  }

  return streak
}

export function lagosToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })
}

function addDays(isoDate: string, delta: number): string {
  const d = new Date(isoDate + "T12:00:00Z")
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Days until an assessment date (positive = future, 0 = today, negative = past). */
export function daysUntil(isoDate: string): number {
  const today = lagosToday()
  const a = new Date(today + "T12:00:00Z").getTime()
  const b = new Date(isoDate + "T12:00:00Z").getTime()
  return Math.round((b - a) / 86_400_000)
}
