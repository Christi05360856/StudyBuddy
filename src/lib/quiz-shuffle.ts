// PATH: src/lib/quiz-shuffle.ts
/**
 * Fresh random paper every attempt: shuffle questions and option order.
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

/** New order of questions every time. */
export function shuffleQuestions<T>(list: T[]): T[] {
  return shuffleInPlace([...list])
}

/**
 * Shuffle A–D options and keep correct_index pointing at the right answer.
 */
export function shuffleOptions(q: QuizQuestion): QuizQuestion {
  const indexed = q.options.map((text, i) => ({ text, i }))
  shuffleInPlace(indexed)
  const options = indexed.map((x) => x.text)
  const correct_index = indexed.findIndex((x) => x.i === q.correct_index)
  return {
    ...q,
    options,
    correct_index: correct_index < 0 ? q.correct_index : correct_index,
  }
}

/** Build the paper for one attempt: take N from pool, shuffle order + options. */
export function buildAttemptPaper(pool: QuizQuestion[], count: number): QuizQuestion[] {
  const mixed = shuffleQuestions(pool)
  const slice = mixed.slice(0, Math.min(count, mixed.length))
  return slice.map(shuffleOptions)
}
