// PATH: src/lib/ai/source-text.ts
/**
 * Phase 2 — Turn extracted MaterialInput into original source text + retrieval chunks.
 * Separate from AI-generated "notes" summaries.
 */
import type { MaterialInput } from "@/lib/extract-content"

export type SourceChunk = {
  chunk_index: number
  content: string
  page_start: number | null
  page_end: number | null
  heading: string | null
}

const TARGET_CHARS = 900
const MAX_CHUNKS = 80

/** Flatten extract result into labeled sections for chunking. */
export function materialInputToSections(
  input: MaterialInput
): { label: string; text: string; page: number | null }[] {
  if (input.type === "pages") {
    return input.pages
      .filter((p) => p.text.trim().length > 0)
      .map((p) => ({
        label: `Page ${p.page}`,
        text: p.text.trim(),
        page: p.page,
      }))
  }
  if (input.type === "text") {
    const text = input.text.trim()
    if (!text) return []
    // Prefer heading-like splits, then blank lines
    const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
    return blocks.map((b, i) => {
      const firstLine = b.split("\n")[0]?.trim() ?? ""
      const heading =
        firstLine.length > 0 && firstLine.length < 80 && !/[.!?]$/.test(firstLine)
          ? firstLine
          : null
      return {
        label: heading || `Part ${i + 1}`,
        text: b,
        page: null,
      }
    })
  }
  // inline (scan/photo): no reliable original text without OCR here
  return []
}

/** Build retrieval-sized chunks from original extract (not AI summary). */
export function buildSourceChunks(input: MaterialInput): SourceChunk[] {
  const sections = materialInputToSections(input)
  if (sections.length === 0) return []

  const raw: Omit<SourceChunk, "chunk_index">[] = []

  for (const s of sections) {
    if (s.text.length <= TARGET_CHARS * 1.4) {
      raw.push({
        content: s.text,
        page_start: s.page,
        page_end: s.page,
        heading: s.label.startsWith("Page ") ? null : s.label,
      })
      continue
    }
    // Split long section by paragraphs
    const paras = s.text.split(/\n+/).map((p) => p.trim()).filter(Boolean)
    let buf = ""
    for (const para of paras) {
      if (buf.length + para.length + 1 > TARGET_CHARS && buf.length > 200) {
        raw.push({
          content: buf,
          page_start: s.page,
          page_end: s.page,
          heading: s.label.startsWith("Page ") ? null : s.label,
        })
        buf = para
      } else {
        buf = buf ? `${buf}\n${para}` : para
      }
    }
    if (buf.trim()) {
      raw.push({
        content: buf.trim(),
        page_start: s.page,
        page_end: s.page,
        heading: s.label.startsWith("Page ") ? null : s.label,
      })
    }
  }

  return raw.slice(0, MAX_CHUNKS).map((c, i) => ({ ...c, chunk_index: i }))
}

/** Single string of original text (for diagnostics / fallback). */
export function materialInputToPlainText(input: MaterialInput, maxChars = 100_000): string {
  const sections = materialInputToSections(input)
  if (sections.length === 0) return ""
  let out = ""
  for (const s of sections) {
    const piece = s.page != null ? `[Page ${s.page}]\n${s.text}` : s.text
    if (out.length + piece.length + 2 > maxChars) break
    out += (out ? "\n\n" : "") + piece
  }
  return out
}
