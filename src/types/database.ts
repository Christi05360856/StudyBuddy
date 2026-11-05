// PATH: src/types/database.ts
export type Profile = {
  id: string
  full_name: string
  matric_number: string
  institution: string
  department: string | null
  level: string | null
  role: "student" | "admin"
  created_at: string
}

export type Course = {
  id: string
  user_id: string
  code: string
  code_normalized: string | null
  title: string | null
  assessment_date: string | null
  created_at: string
}

export type Material = {
  id: string
  course_id: string
  user_id: string
  title: string
  file_path: string
  file_size: number | null
  page_count: number | null
  status: "uploading" | "processing" | "ready" | "failed"
  content_text: string | null
  topics: string[] | null
  created_at: string
}

export type Question = {
  id: string
  material_id: string
  question_text: string
  options: string[]
  correct_index: number
  explanation: string | null
  page_reference: string | null
  topic: string | null
  created_at: string
}

export type QuizAttempt = {
  id: string
  user_id: string
  material_id: string
  type: "test" | "exam" | "custom" | "quick"
  total_questions: number
  correct_count: number
  time_taken_seconds: number
  answers: Record<string, number>
  created_at: string
}

export type StudyDay = {
  user_id: string
  day: string
}

export type FlashcardProgress = {
  user_id: string
  card_key: string
  box: number
  due_date: string
}
