// PATH: src/lib/ai/generate-questions.ts
/**
 * Reads a study file with Gemini and returns:
 *  - topics    (list of topic names for the AI Tutor)
 *  - notes     (a summary of the lecture, used as context by the AI Tutor)
 *  - questions (multiple-choice questions for tests and exams)
 *
 * PDFs and photos are sent to Gemini as they are, so the AI really reads them.
 * Word, PowerPoint, Excel and text files arrive here as extracted text (see extract-content.ts).
 */

import { callGemini, parseJson } from "@/lib/ai/gemini"
import type { MaterialInput } from "@/lib/extract-content"

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

export async function analyzeMaterial(input: MaterialInput): Promise<MaterialAnalysis> {
  const prompt = PROMPT + (EXTRA_BY_KIND[input.kind] ?? "")

  const result = await callGemini({
    parts:
      input.type === "inline"
        ? [{ inline_data: { mime_type: input.mimeType, data: input.base64 } }, { text: prompt }]
        : [{ text: `${prompt}\n\nSTUDY MATERIAL:\n${input.text}` }],
    json: true,
    maxOutputTokens: 32768,
    timeoutMs: 55000,
  })

  if (!result.ok) return { ok: false, error: result.error }

  const parsed = parseJson<{
    topics?: unknown
    notes?: unknown
    questions?: RawQuestion[]
  }>(result.text)

  if (!parsed) {
    return { ok: false, error: "The AI reply could not be read. Please try again." }
  }

  const topics = Array.isArray(parsed.topics)
    ? parsed.topics.map((t) => String(t).trim()).filter(Boolean).slice(0, 12)
    : []

  const notes = typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 20000) : ""

  const questions: GeneratedQuestion[] = []
  for (const q of parsed.questions ?? []) {
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

  return { ok: true, topics, notes, questions: questions.slice(0, 40) }
}
