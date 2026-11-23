// PATH: src/lib/ai/learning-state.ts
/**
 * Phase 3 — Structured learning state (separate from chat transcript).
 */

export const TUTOR_STAGES = [
  "orient",
  "explain",
  "demonstrate",
  "check",
  "evaluate",
  "adapt",
  "consolidate",
] as const

export type TutorStage = (typeof TUTOR_STAGES)[number]

export type PerformanceResult = "correct" | "partial" | "incorrect"

export type LearningState = {
  sessionId: string
  materialId: string | null
  topicTitle: string
  preferredLevel: string
  currentLevel: string
  currentStage: TutorStage
  completedSections: string[]
  understoodConcepts: string[]
  strugglingConcepts: string[]
  misconceptions: { concept: string; description: string; evidence: string }[]
  recentPerformance: { questionId: string; result: PerformanceResult }[]
  nextRecommendedAction: "continue" | "explain_differently" | "give_hint" | "practice" | "recap"
  updatedAt: string
}

export type LessonBlock =
  | { type: "explanation"; title?: string; content: string }
  | { type: "example"; title?: string; content: string }
  | { type: "code"; title?: string; content: string; language?: string }
  | { type: "callout"; title?: string; content: string }
  | { type: "recap"; title?: string; content: string }
  | {
      type: "understanding_check"
      questionId: string
      prompt: string
      answerType: "single_choice" | "short_text"
      options?: { id: string; text: string }[]
      /** Internal only — never sent to client in production ideal; we strip before respond */
      expectedAnswer?: string
    }

export type EvaluationPayload = {
  questionId: string
  result: "correct" | "partially_correct" | "incorrect"
  feedback: string
  misconception?: { detected: boolean; label?: string; explanation?: string }
  recommendedAction: "explain_differently" | "give_hint" | "practice" | "continue"
  nextPrompt?: string
}

export function emptyLearningState(partial: {
  sessionId: string
  materialId: string | null
  topicTitle: string
  preferredLevel: string
}): LearningState {
  const now = new Date().toISOString()
  return {
    sessionId: partial.sessionId,
    materialId: partial.materialId,
    topicTitle: partial.topicTitle,
    preferredLevel: partial.preferredLevel,
    currentLevel: partial.preferredLevel,
    currentStage: "orient",
    completedSections: [],
    understoodConcepts: [],
    strugglingConcepts: [],
    misconceptions: [],
    recentPerformance: [],
    nextRecommendedAction: "continue",
    updatedAt: now,
  }
}

export function isTutorStage(v: unknown): v is TutorStage {
  return typeof v === "string" && (TUTOR_STAGES as readonly string[]).includes(v)
}

/** Merge model-suggested state patch into existing state (validated). */
export function mergeLearningState(
  current: LearningState,
  patch: Partial<LearningState> | null | undefined
): LearningState {
  if (!patch) return { ...current, updatedAt: new Date().toISOString() }

  const next: LearningState = {
    ...current,
    updatedAt: new Date().toISOString(),
  }

  if (typeof patch.currentLevel === "string" && patch.currentLevel.trim()) {
    next.currentLevel = patch.currentLevel.trim().slice(0, 40)
  }
  if (isTutorStage(patch.currentStage)) next.currentStage = patch.currentStage

  if (Array.isArray(patch.completedSections)) {
    next.completedSections = patch.completedSections.map(String).slice(0, 30)
  }
  if (Array.isArray(patch.understoodConcepts)) {
    next.understoodConcepts = uniqueStrings([
      ...current.understoodConcepts,
      ...patch.understoodConcepts.map(String),
    ]).slice(0, 40)
  }
  if (Array.isArray(patch.strugglingConcepts)) {
    next.strugglingConcepts = uniqueStrings([
      ...current.strugglingConcepts,
      ...patch.strugglingConcepts.map(String),
    ]).slice(0, 40)
  }
  if (Array.isArray(patch.misconceptions)) {
    const cleaned = patch.misconceptions
      .map((m) => ({
        concept: String((m as { concept?: string }).concept || "").slice(0, 120),
        description: String((m as { description?: string }).description || "").slice(0, 400),
        evidence: String((m as { evidence?: string }).evidence || "").slice(0, 400),
      }))
      .filter((m) => m.concept)
    next.misconceptions = [...current.misconceptions, ...cleaned].slice(-15)
  }
  if (Array.isArray(patch.recentPerformance)) {
    const cleaned = patch.recentPerformance
      .map((p) => {
        const result = String((p as { result?: string }).result || "")
        if (result !== "correct" && result !== "partial" && result !== "incorrect") return null
        return {
          questionId: String((p as { questionId?: string }).questionId || "").slice(0, 80),
          result: result as PerformanceResult,
        }
      })
      .filter(Boolean) as { questionId: string; result: PerformanceResult }[]
    next.recentPerformance = [...current.recentPerformance, ...cleaned].slice(-20)
  }

  const action = patch.nextRecommendedAction
  if (
    action === "continue" ||
    action === "explain_differently" ||
    action === "give_hint" ||
    action === "practice" ||
    action === "recap"
  ) {
    next.nextRecommendedAction = action
  }

  return next
}

function uniqueStrings(arr: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of arr) {
    const t = s.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** Build display markdown from structured blocks (fallback-friendly). */
export function blocksToMarkdown(blocks: LessonBlock[]): string {
  const parts: string[] = []
  for (const b of blocks) {
    // Checks are rendered only by UnderstandingCheckCard — never in Markdown
    if (b.type === "understanding_check") continue
    const title = b.title ? `## ${b.title}\n\n` : ""
    if (b.type === "code") {
      const lang = b.language || ""
      parts.push(`${title}\`\`\`${lang}\n${b.content}\n\`\`\``)
    } else {
      parts.push(`${title}${b.content}`)
    }
  }
  return parts.join("\n\n")
}

export function parseLessonBlocks(raw: unknown): LessonBlock[] {
  if (!Array.isArray(raw)) return []
  const out: LessonBlock[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const t = String((item as { type?: string }).type || "")
    const content = String((item as { content?: string }).content || "").trim()
    const title =
      typeof (item as { title?: string }).title === "string"
        ? (item as { title: string }).title.slice(0, 120)
        : undefined

    if (t === "understanding_check") {
      const prompt = String((item as { prompt?: string }).prompt || content || "").trim()
      if (!prompt) continue
      const questionId =
        String((item as { questionId?: string }).questionId || `q-${out.length + 1}`).slice(0, 80)
      const answerType =
        (item as { answerType?: string }).answerType === "short_text" ? "short_text" : "single_choice"
      let options: { id: string; text: string }[] | undefined
      if (Array.isArray((item as { options?: unknown }).options)) {
        options = ((item as { options: unknown[] }).options)
          .map((o, i) => {
            if (!o || typeof o !== "object") return null
            const text = String((o as { text?: string }).text || "").trim()
            if (!text) return null
            const id = String((o as { id?: string }).id || String.fromCharCode(97 + i)).slice(0, 16)
            return { id, text: text.slice(0, 300) }
          })
          .filter(Boolean) as { id: string; text: string }[]
        if (options.length < 2) options = undefined
      }
      out.push({
        type: "understanding_check",
        questionId,
        prompt: prompt.slice(0, 800),
        answerType,
        options,
        expectedAnswer:
          typeof (item as { expectedAnswer?: string }).expectedAnswer === "string"
            ? String((item as { expectedAnswer: string }).expectedAnswer).slice(0, 500)
            : undefined,
      })
      continue
    }

    if (!content) continue
    if (t === "example" || t === "code" || t === "callout" || t === "recap" || t === "explanation") {
      out.push({
        type: t,
        title,
        content: content.slice(0, 6000),
        ...(t === "code"
          ? {
              language:
                typeof (item as { language?: string }).language === "string"
                  ? (item as { language: string }).language.slice(0, 30)
                  : undefined,
            }
          : {}),
      } as LessonBlock)
    } else {
      out.push({ type: "explanation", title, content: content.slice(0, 6000) })
    }
  }
  return out.slice(0, 12)
}

export function parseEvaluation(raw: unknown): EvaluationPayload | null {
  if (!raw || typeof raw !== "object") return null
  const result = String((raw as { result?: string }).result || "")
  if (result !== "correct" && result !== "partially_correct" && result !== "incorrect") return null
  const questionId = String((raw as { questionId?: string }).questionId || "").slice(0, 80)
  const feedback = String((raw as { feedback?: string }).feedback || "").trim().slice(0, 2000)
  if (!feedback) return null
  let recommendedAction = String((raw as { recommendedAction?: string }).recommendedAction || "continue")
  if (
    recommendedAction !== "explain_differently" &&
    recommendedAction !== "give_hint" &&
    recommendedAction !== "practice" &&
    recommendedAction !== "continue"
  ) {
    recommendedAction = "continue"
  }
  const evaluation: EvaluationPayload = {
    questionId,
    result: result as EvaluationPayload["result"],
    feedback,
    recommendedAction: recommendedAction as EvaluationPayload["recommendedAction"],
  }
  const mc = (raw as { misconception?: unknown }).misconception
  if (mc && typeof mc === "object") {
    evaluation.misconception = {
      detected: Boolean((mc as { detected?: boolean }).detected),
      label:
        typeof (mc as { label?: string }).label === "string"
          ? String((mc as { label: string }).label).slice(0, 120)
          : undefined,
      explanation:
        typeof (mc as { explanation?: string }).explanation === "string"
          ? String((mc as { explanation: string }).explanation).slice(0, 800)
          : undefined,
    }
  }
  if (typeof (raw as { nextPrompt?: string }).nextPrompt === "string") {
    evaluation.nextPrompt = String((raw as { nextPrompt: string }).nextPrompt).slice(0, 400)
  }
  return evaluation
}

/** Strip answer keys before sending lesson blocks to the client. */
export function publicBlocks(blocks: LessonBlock[]): LessonBlock[] {
  return blocks.map((b) => {
    if (b.type !== "understanding_check") return b
    const { expectedAnswer: _drop, ...rest } = b
    return rest
  })
}
