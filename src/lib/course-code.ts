// PATH: src/lib/course-code.ts
/**
 * Course-code helpers for Nigerian universities / polytechnics.
 * Canonical form is always "AAA 000" or "AAA 000A" (single space).
 */

const CODE_REGEX = /^[A-Z]{2,4} \d{3}[A-Z]?$/

/** Live formatter while the student types. Always returns uppercase. */
export function formatCourseCodeInput(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const match = cleaned.match(/^([A-Z]{0,4})(\d{0,3}[A-Z]?)$/)
  if (!match) return cleaned.slice(0, 8)

  const letters = match[1]
  const numbers = match[2]
  if (!numbers) return letters
  return `${letters} ${numbers}`
}

/** Returns the canonical form or null if invalid. */
export function normalizeCourseCode(raw: string): string | null {
  const formatted = formatCourseCodeInput(raw).trim()
  if (!CODE_REGEX.test(formatted)) return null
  return formatted
}

/** Uppercase, no spaces – used for the unique index. */
export function toCodeNormalized(canonical: string): string {
  return canonical.replace(/\s+/g, "").toUpperCase()
}

/** Simple Title Case for course titles. */
export function toTitleCase(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function isValidTitle(title: string): boolean {
  const t = title.trim()
  return t.length >= 3 && t.length <= 80
}
