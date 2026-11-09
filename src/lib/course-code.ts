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

/**
 * Find course-code-like tokens in a filename or label
 * e.g. "CSC337_notes.pdf", "Lecture CSC 205.docx", "sen-301-week2"
 */
export function findCourseCodesInText(text: string): string[] {
  const upper = text.toUpperCase()
  const found = new Set<string>()
  // CSC337, CSC 337, CSC-337, csc_337
  const re = /\b([A-Z]{2,4})[\s_\-]?(\d{3}[A-Z]?)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(upper)) !== null) {
    const canon = `${m[1]} ${m[2]}`
    if (CODE_REGEX.test(canon)) found.add(canon)
  }
  return [...found]
}

/**
 * If the file/title clearly names a different course code, return that code.
 * Returns null when OK to upload (no other code found, or only matches this course).
 */
export function mismatchedCourseCode(
  courseCode: string,
  fileName: string,
  materialTitle?: string
): string | null {
  const expected = toCodeNormalized(courseCode)
  const blob = `${fileName} ${materialTitle ?? ""}`
  const found = findCourseCodesInText(blob)
  if (found.length === 0) return null
  const foreign = found.find((c) => toCodeNormalized(c) !== expected)
  return foreign ?? null
}
