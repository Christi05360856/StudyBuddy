// PATH: src/lib/quiz-shuffle.ts
/**
 * Fresh random paper every attempt.
 * IMPORTANT: only shuffle QUESTION order — never option order.
 * Option indices must stay aligned with the database so marking and review stay correct.
 */

export type QuizQuestion = {
  id: string
  question_text: string
  options: string[]
  correct_index: number
  page_reference: string | null
  explanation: string | null
  topic: string | null
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** New order of questions every time. Options stay as stored. */
export function shuffleQuestions<T>(list: T[]): T[] {
  return shuffleInPlace([...list])
}

/**
 * Build the paper for one attempt: take N from pool, shuffle question order only.
 * Do NOT shuffle A–D — that breaks scoring when the result page reloads from the DB.
 */
export function buildAttemptPaper(pool: QuizQuestion[], count: number): QuizQuestion[] {
  const mixed = shuffleQuestions(pool)
  return mixed.slice(0, Math.min(count, mixed.length)).map((q) => ({
    ...q,
    // Defensive copy so later mutations cannot touch the pool
    options: [...q.options],
  }))
}
