// PATH: src/lib/ai/generate-questions.ts
/**
 * Reads a study file with the AI and returns:
 *  - topics    (list of topic names for the AI Tutor)
 *  - notes     (a summary of the lecture, used as context by the AI Tutor)
 *  - questions (multiple-choice questions for tests and exams)
 *
 * PDFs and photos are sent to Gemini as they are, so the AI really reads them.
 * Word, PowerPoint, Excel and text files arrive here as extracted text (see extract-content.ts).
 */

import { callGemini, parseJson } from "@/lib/ai/gemini"
import type { MaterialInput } from "@/lib/extract-content"

// Tells the caller how far we are: "done" of "total" parts finished
export type ProgressFn = (done: number, total: number) => void

export type GeneratedQuestion = {
  question_text: string
  options: [string, string, string, string]
  correct_index: number // 0-3
  explanation?: string
  page_reference?: string
  topic?: string
}

export type MaterialAnalysis =
  | { ok: true; topics: string[]; notes: string; questions: GeneratedQuestion[] }
  | { ok: false; error: string }

const PROMPT = `You are an expert lecturer and exam question writer for Nigerian university and polytechnic students.

You are given a student's study material (lecture notes, slides, handout, spreadsheet or a photo of notes). Read it carefully and return ONLY valid JSON in exactly this shape:
{
  "topics": ["Topic 1", "Topic 2"],
  "notes": "Clear study notes in plain text",
  "questions": [
    {
      "question_text": "...",
      "options": ["option A", "option B", "option C", "option D"],
      "correct_index": 0,
      "explanation": "Short reason why this is correct",
      "topic": "Topic name",
      "page_reference": "Page, slide, sheet or section"
    }
  ]
}

RULES FOR "topics":
- 5 to 12 short topic names, in the order they appear in the material.
- They must come from the material, not from general knowledge.

RULES FOR "notes":
- Plain text, about 800 to 1200 words.
- Cover the key points, definitions, steps and examples that are in the material.
- Do not invent anything that is not in the material.

RULES FOR "questions":
- Write exactly 30 questions based ONLY on the material.
- Exactly 4 options per question.
- All four options must be plausible and closely related, so the student has real doubt.
- Options must be similar in length. The correct answer must not be longer or shorter than the others.
- Test understanding, not just memorising definitions.
- Keep wording clear and short.
- Spread the correct answer across positions (do not always use the first option).

If the material has no readable content, return {"topics": [], "notes": "", "questions": []}.`

// Extra guidance that depends on the kind of file
const EXTRA_BY_KIND: Record<string, string> = {
  excel: `
EXTRA RULES FOR THIS SPREADSHEET:
- The material is spreadsheet data (sheets with rows and columns, cells separated by " | ").
- Write questions about what the data shows: reading values, comparing rows, totals, averages, trends, formulas and the statistical or accounting concepts the data is used to teach.
- Never ask about cell positions or formatting. Give every question enough context to be answered by itself.`,
  powerpoint: `
EXTRA RULES FOR THESE SLIDES:
- The material is the text of lecture slides. Slides are short, so use your subject knowledge only to make the topic clear; the questions must still be answerable from the slides.
- Use the slide number as the page reference.`,
  image: `
EXTRA RULES FOR THIS PHOTO:
- The material is a photo of notes, a board or a textbook page. Read the handwriting or print as carefully as you can.
- Ignore parts that are blurry or unreadable. Do not guess.`,
}

// Mixes the options so the correct answer is not always in the same place
function shuffleOptions(
  options: string[],
  correctIndex: number
): { options: [string, string, string, string]; correct_index: number } {
  const order = [0, 1, 2, 3]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return {
    options: order.map((i) => options[i]) as [string, string, string, string],
    correct_index: order.indexOf(correctIndex),
  }
}

type RawQuestion = {
  question_text?: unknown
  options?: unknown
  correct_index?: unknown
  explanation?: unknown
  topic?: unknown
  page_reference?: unknown
}

// Turns the AI's raw question list into clean, checked questions
function parseQuestions(raw: RawQuestion[] | undefined): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = []
  for (const q of raw ?? []) {
    if (!Array.isArray(q.options) || q.options.length !== 4) continue
    const options = q.options.map((o) => String(o).trim())
    const correct = Number(q.correct_index)
    const text = String(q.question_text ?? "").trim()
    if (!text || options.some((o) => !o)) continue
    if (!Number.isInteger(correct) || correct < 0 || correct > 3) continue

    const mixed = shuffleOptions(options, correct)
    questions.push({
      question_text: text,
      options: mixed.options,
      correct_index: mixed.correct_index,
      explanation: q.explanation ? String(q.explanation).trim() : undefined,
      topic: q.topic ? String(q.topic).trim() : undefined,
      page_reference: q.page_reference ? String(q.page_reference).trim() : undefined,
    })
  }
  return questions
}

function cleanTopics(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((t) => String(t).trim()).filter(Boolean) : []
}

// ---------- Path 1: a photo or scanned PDF (the AI looks at the file itself) ----------

async function analyzeInline(input: Extract<MaterialInput, { type: "inline" }>): Promise<MaterialAnalysis> {
  const prompt = PROMPT + (EXTRA_BY_KIND[input.kind] ?? "")

  const result = await callGemini({
    parts: [{ inline_data: { mime_type: input.mimeType, data: input.base64 } }, { text: prompt }],
    json: true,
    maxOutputTokens: 32768,
    timeoutMs: 55000,
  })
  if (!result.ok) return { ok: false, error: result.error }

  const parsed = parseJson<{ topics?: unknown; notes?: unknown; questions?: RawQuestion[] }>(result.text)
  if (!parsed) return { ok: false, error: "The AI reply could not be read. Please try again." }

  return {
    ok: true,
    topics: cleanTopics(parsed.topics).slice(0, 12),
    notes: typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 20000) : "",
    questions: parseQuestions(parsed.questions).slice(0, 40),
  }
}

// ---------- Path 2: text we already read (fast: small parts run at the same time) ----------

type Section = { label: string; text: string }

const CHUNK_CHARS = 24_000 // about 6,000 words per AI call
const MAX_CHUNKS = 4 // at most 4 calls per upload, to protect the free daily quota
const MAX_QUESTIONS = 30

// Cuts the material into labelled sections (pages, slides, sheets or plain parts)
function toSections(input: Exclude<MaterialInput, { type: "inline" }>): Section[] {
  if (input.type === "pages") {
    return input.pages.map((p) => ({ label: `Page ${p.page}`, text: p.text }))
  }

  // Slides and sheets already carry markers like "--- Slide 3 ---"
  const marked = input.text.split(/^(?=--- .+ ---$)/m).filter((t) => t.trim())
  if (marked.length > 1 || /^--- .+ ---$/m.test(input.text)) {
    return marked.map((block, i) => {
      const firstLine = block.split("\n")[0]
      const m = firstLine.match(/^--- (.+?)(?: \(\d+ rows\))? ---$/)
      return { label: m ? m[1] : `Part ${i + 1}`, text: m ? block.slice(firstLine.length).trim() : block.trim() }
    })
  }

  // Plain text: group paragraphs into parts of about 3,000 characters
  const sections: Section[] = []
  let current = ""
  for (const para of input.text.split(/\n{2,}/)) {
    if (current && current.length + para.length > 3000) {
      sections.push({ label: `Part ${sections.length + 1}`, text: current })
      current = ""
    }
    current += (current ? "\n\n" : "") + para
  }
  if (current) sections.push({ label: `Part ${sections.length + 1}`, text: current })
  return sections
}

// Groups sections into 1 to 4 chunks of similar size
function makeChunks(sections: Section[]): Section[][] {
  const total = sections.reduce((n, s) => n + s.text.length, 0)
  const count = Math.min(MAX_CHUNKS, Math.max(1, Math.ceil(total / CHUNK_CHARS)))
  const target = total / count

  const chunks: Section[][] = []
  let current: Section[] = []
  let size = 0
  for (const s of sections) {
    current.push(s)
    size += s.text.length
    if (size >= target && chunks.length < count - 1) {
      chunks.push(current)
      current = []
      size = 0
    }
  }
  if (current.length) chunks.push(current)
  return chunks
}

function chunkPrompt(questionCount: number, kind: string): string {
  return `You are an expert lecturer and exam question writer for Nigerian university and polytechnic students.

You are given one part of a student's study material. Each piece is marked like [Page 3], [Slide 5] or [Part 2]. Read it carefully and return ONLY valid JSON in exactly this shape:
{
  "topics": ["Topic 1", "Topic 2"],
  "summary": "Short study notes in plain text",
  "questions": [
    {
      "question_text": "...",
      "options": ["option A", "option B", "option C", "option D"],
      "correct_index": 0,
      "explanation": "Short reason why this is correct",
      "topic": "Topic name",
      "page_reference": "Page 3"
    }
  ]
}

RULES FOR "topics": 2 to 4 short topic names that come from this part, in the order they appear.

RULES FOR "summary": plain text, 150 to 220 words. Key points, definitions, steps and examples from this part only. Do not invent anything.

RULES FOR "questions":
- Write exactly ${questionCount} questions based ONLY on this part.
- Exactly 4 options per question.
- All four options must be plausible and closely related, so the student has real doubt.
- Options must be similar in length. The correct answer must not be longer or shorter than the others.
- Test understanding, not just memorising definitions. Keep wording clear and short.
- "page_reference" must be the marker (for example "Page 3" or "Slide 5") where the answer is found.
- Spread the correct answer across positions.

If this part has no readable content, return {"topics": [], "summary": "", "questions": []}.${EXTRA_BY_KIND[kind] ?? ""}`
}

type ChunkResult = { ok: true; topics: string[]; summary: string; questions: GeneratedQuestion[] } | { ok: false; error: string }

async function runChunk(chunk: Section[], questionCount: number, kind: string, timeoutMs: number): Promise<ChunkResult> {
  const body = chunk.map((s) => `[${s.label}]\n${s.text}`).join("\n\n")

  const result = await callGemini({
    parts: [{ text: `${chunkPrompt(questionCount, kind)}\n\nSTUDY MATERIAL:\n${body}` }],
    json: true,
    maxOutputTokens: 16384,
    timeoutMs,
  })
  if (!result.ok) return { ok: false, error: result.error }

  const parsed = parseJson<{ topics?: unknown; summary?: unknown; questions?: RawQuestion[] }>(result.text)
  if (!parsed) return { ok: false, error: "The AI reply could not be read." }

  return {
    ok: true,
    topics: cleanTopics(parsed.topics),
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    questions: parseQuestions(parsed.questions),
  }
}

async function analyzeSections(
  input: Exclude<MaterialInput, { type: "inline" }>,
  onProgress?: ProgressFn
): Promise<MaterialAnalysis> {
  const sections = toSections(input).filter((s) => s.text.trim())
  if (sections.length === 0) return { ok: true, topics: [], notes: "", questions: [] }

  const chunks = makeChunks(sections)
  const totalChars = sections.reduce((n, s) => n + s.text.length, 0)

  // Short material gets fewer questions (about one per 250 characters, between 8 and 30)
  const wanted = Math.min(MAX_QUESTIONS, Math.max(8, Math.round(totalChars / 250)))
  const perChunk = chunks.map((_, i) => Math.floor(wanted / chunks.length) + (i < wanted % chunks.length ? 1 : 0))

  let done = 0
  onProgress?.(0, chunks.length)

  // First round: every chunk at the same time
  const results: ChunkResult[] = await Promise.all(
    chunks.map(async (chunk, i) => {
      const r = await runChunk(chunk, perChunk[i], input.kind, 30000)
      if (r.ok) onProgress?.(++done, chunks.length)
      return r
    })
  )

  // Second round: try each failed chunk one more time
  for (let i = 0; i < results.length; i++) {
    if (results[i].ok) continue
    const retry = await runChunk(chunks[i], perChunk[i], input.kind, 18000)
    results[i] = retry
    if (retry.ok) onProgress?.(++done, chunks.length)
  }

  const good = results.filter((r): r is Extract<ChunkResult, { ok: true }> => r.ok)
  if (good.length === 0) {
    const firstError = results.find((r) => !r.ok) as { ok: false; error: string }
    return { ok: false, error: firstError.error }
  }

  // Join the parts: topics without repeats, notes in order, questions without repeats
  const seenTopics = new Set<string>()
  const topics: string[] = []
  for (const t of good.flatMap((r) => r.topics)) {
    const key = t.toLowerCase()
    if (!seenTopics.has(key)) {
      seenTopics.add(key)
      topics.push(t)
    }
  }

  const seenQuestions = new Set<string>()
  const questions: GeneratedQuestion[] = []
  for (const q of good.flatMap((r) => r.questions)) {
    const key = q.question_text.toLowerCase().replace(/\s+/g, " ")
    if (!seenQuestions.has(key)) {
      seenQuestions.add(key)
      questions.push(q)
    }
  }

  return {
    ok: true,
    topics: topics.slice(0, 12),
    notes: good.map((r) => r.summary).filter(Boolean).join("\n\n").slice(0, 20000),
    questions: questions.slice(0, 40),
  }
}

// ---------- The one function the rest of the app calls ----------

export async function analyzeMaterial(input: MaterialInput, onProgress?: ProgressFn): Promise<MaterialAnalysis> {
  return input.type === "inline" ? analyzeInline(input) : analyzeSections(input, onProgress)
}
