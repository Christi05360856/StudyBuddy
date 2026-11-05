// PATH: src/lib/quiz-review.ts
// Shared by the quiz page and the result page.

// One question as shown on the review screen.
// picked = the option the student chose (0-3), or -1 when they skipped it.
export type ReviewItem = {
  id: string
  question_text: string
  options: string[]
  correct_index: number
  picked: number
  explanation: string | null
  topic: string | null
  page_reference: string | null
}

// If saving the quiz fails (bad network), the quiz page keeps a copy here
// so the student can still see the review on the result page.
export const LAST_RESULT_KEY = "studybuddy-last-result"

export type LastResult = {
  materialId: string
  total: number
  correct: number
  seconds: number
  review: ReviewItem[]
}
