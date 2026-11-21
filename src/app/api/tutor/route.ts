// PATH: src/app/api/tutor/route.ts
import { NextRequest, NextResponse } from "next/server"
import { callGemini, parseJson } from "@/lib/ai/gemini"
import { createClient } from "@/lib/supabase/server"
import {
  AI_LIMITS,
  limitReachedMessage,
  isMissingLimitSetup,
  providerBusyMessage,
} from "@/lib/ai/limits"
import {
  buildTutorSystemInstruction,
  buildTutorUserContent,
  normalizeLevel,
} from "@/lib/ai/tutor-policy"
import { formatChunksForTutor, retrieveMaterialChunks } from "@/lib/ai/retrieval"
import {
  blocksToMarkdown,
  emptyLearningState,
  mergeLearningState,
  parseEvaluation,
  parseLessonBlocks,
  publicBlocks,
  type LearningState,
  type LessonBlock,
} from "@/lib/ai/learning-state"

type ChatMessage = { role: "user" | "assistant"; content: string }
type TutorAction =
  | "start_lesson"
  | "student_message"
  | "submit_answer"
  | "request_hint"
  | "request_reexplanation"
  | "recap"

function detectAction(raw: unknown, hasAnswer: boolean): TutorAction {
  const a = String(raw || "").trim()
  if (
    a === "start_lesson" ||
    a === "student_message" ||
    a === "submit_answer" ||
    a === "request_hint" ||
    a === "request_reexplanation" ||
    a === "recap"
  ) {
    return a
  }
  if (hasAnswer) return "submit_answer"
  return "student_message"
}

function actionInstructions(action: TutorAction): string {
  switch (action) {
    case "start_lesson":
      return `ACTION: start_lesson
Open the topic. Orient briefly, explain the core idea, demonstrate with one example, then include ONE understanding_check (multiple choice with 3–4 options when possible).
Do not reveal the correct option in the visible content. Put the correct option id or short key in expectedAnswer on that block only.`
    case "submit_answer":
      return `ACTION: submit_answer
Evaluate the student's answer. Fill "evaluation" with result (correct | partially_correct | incorrect), specific feedback, and recommendedAction.
Then continue teaching in blocks based on that result (adapt: re-explain differently if wrong, deepen if correct).
If appropriate, include a new understanding_check.`
    case "request_hint":
      return `ACTION: request_hint
Give a useful hint for the current idea or pending check — not the full final answer. One short block is enough, then invite them to try.`
    case "request_reexplanation":
      return `ACTION: request_reexplanation
Explain the same idea with a different approach (new analogy or structure). Do not only rephrase the previous paragraph.`
    case "recap":
      return `ACTION: recap
Consolidate key points for this topic in a recap block. Offer one optional practice question as understanding_check.`
    default:
      return `ACTION: student_message
Answer the student directly. Use the teaching cycle only when it helps. If checking understanding is natural, include at most one understanding_check.`
  }
}

function structuredOutputSpec(): string {
  return `Return ONLY valid JSON (no markdown fences) with this shape:
{
  "replyMarkdown": "optional plain markdown fallback if blocks empty",
  "statePatch": {
    "currentStage": "orient|explain|demonstrate|check|evaluate|adapt|consolidate",
    "currentLevel": "very_simple|standard|advanced|exam_ready",
    "understoodConcepts": [],
    "strugglingConcepts": [],
    "misconceptions": [{ "concept": "", "description": "", "evidence": "" }],
    "recentPerformance": [{ "questionId": "", "result": "correct|partial|incorrect" }],
    "nextRecommendedAction": "continue|explain_differently|give_hint|practice|recap",
    "completedSections": []
  },
  "blocks": [
    { "type": "explanation|example|code|callout|recap", "title": "optional", "content": "..." },
    {
      "type": "understanding_check",
      "questionId": "q1",
      "prompt": "question text",
      "answerType": "single_choice",
      "options": [{ "id": "a", "text": "..." }, { "id": "b", "text": "..." }],
      "expectedAnswer": "a"
    }
  ],
  "evaluation": null
}

Rules:
- Prefer blocks over a long replyMarkdown.
- understanding_check: never put the answer in prompt/options text.
- evaluation required for submit_answer; otherwise null.
- Keep JSON compact; content plain text (no LaTeX $...$).`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Please log in again." }, { status: 401 })
    }

    const { data: allowed, error: creditError } = await supabase.rpc("consume_ai_credit", {
      feature: "tutor",
      daily_limit: AI_LIMITS.tutor,
    })
    if (creditError) {
      console.error("consume_ai_credit error:", creditError)
      if (!isMissingLimitSetup(creditError)) {
        // fail-open
      }
    } else if (allowed === false) {
      return NextResponse.json({ error: limitReachedMessage("tutor") }, { status: 429 })
    }

    const body = await req.json()
    const {
      message,
      level = "standard",
      context,
      history,
      studentName,
      firstMessage,
      materialId,
      topic,
      sessionId: incomingSessionId,
      action: rawAction,
      answer,
    } = body

    const hasAnswer = Boolean(answer && typeof answer === "object")
    const action = detectAction(rawAction, hasAnswer)

    const textMessage =
      typeof message === "string"
        ? message.trim()
        : hasAnswer
          ? `My answer to ${(answer as { questionId?: string }).questionId || "the check"}: ${String((answer as { text?: string }).text || "")}`
          : ""

    if (!textMessage || textMessage.length > 4000) {
      return NextResponse.json({ error: "message required" }, { status: 400 })
    }

    const teachingLevel = normalizeLevel(level)
    const topicStr =
      typeof topic === "string" && topic.trim() ? topic.trim().slice(0, 200) : "general"
    const materialIdStr = typeof materialId === "string" && materialId ? materialId : null

    // ---- Session load / create ----
    let sessionId =
      typeof incomingSessionId === "string" && incomingSessionId ? incomingSessionId : null
    let learningState: LearningState | null = null
    let lastQuestion: {
      questionId?: string
      expectedAnswer?: string
      prompt?: string
    } | null = null

    if (sessionId) {
      const { data: sess } = await supabase
        .from("tutor_sessions")
        .select("id, state, last_question, preferred_level, current_level, current_stage, topic")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (sess) {
        learningState = {
          ...emptyLearningState({
            sessionId: sess.id,
            materialId: materialIdStr,
            topicTitle: topicStr,
            preferredLevel: teachingLevel,
          }),
          ...(typeof sess.state === "object" && sess.state ? (sess.state as object) : {}),
          sessionId: sess.id,
          materialId: materialIdStr,
          topicTitle: topicStr,
          preferredLevel: String(sess.preferred_level || teachingLevel),
          currentLevel: String(sess.current_level || teachingLevel),
        } as LearningState
        lastQuestion =
          sess.last_question && typeof sess.last_question === "object"
            ? (sess.last_question as { questionId?: string; expectedAnswer?: string; prompt?: string })
            : null
      } else {
        sessionId = null
      }
    }

    if (!sessionId) {
      // create session row (soft-fail if table missing)
      const seed = emptyLearningState({
        sessionId: "pending",
        materialId: materialIdStr,
        topicTitle: topicStr,
        preferredLevel: teachingLevel,
      })
      const { data: created, error: createErr } = await supabase
        .from("tutor_sessions")
        .insert({
          user_id: user.id,
          material_id: materialIdStr,
          topic: topicStr,
          preferred_level: teachingLevel,
          current_level: teachingLevel,
          current_stage: "orient",
          state: seed,
        })
        .select("id")
        .maybeSingle()

      if (!createErr && created?.id) {
        sessionId = created.id
        learningState = { ...seed, sessionId: created.id }
      } else {
        if (createErr) console.warn("tutor_sessions create:", createErr.message)
        sessionId = crypto.randomUUID()
        learningState = emptyLearningState({
          sessionId,
          materialId: materialIdStr,
          topicTitle: topicStr,
          preferredLevel: teachingLevel,
        })
      }
    }

    const systemInstruction =
      buildTutorSystemInstruction(teachingLevel) +
      `\n\n${actionInstructions(action)}\n\n${structuredOutputSpec()}`

    const recent: ChatMessage[] = Array.isArray(history) ? history.slice(-10) : []
    const transcript = recent
      .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${String(m.content).slice(0, 1500)}`)
      .join("\n\n")

    const summaryNotes = typeof context === "string" ? context.slice(0, 8000) : ""
    const name =
      typeof studentName === "string"
        ? studentName.replace(/[^a-zA-Z\u00C0-\u024F' -]/g, "").trim().slice(0, 30)
        : ""

    let sourceBlock = ""
    let retrievalCount = 0
    if (materialIdStr) {
      const { data: mat } = await supabase
        .from("materials")
        .select("id")
        .eq("id", materialIdStr)
        .eq("user_id", user.id)
        .maybeSingle()
      if (mat) {
        const query = [topicStr, textMessage].filter(Boolean).join(" ").slice(0, 300)
        const chunks = await retrieveMaterialChunks(supabase, {
          materialId: materialIdStr,
          query,
          limit: 6,
        })
        retrievalCount = chunks.length
        sourceBlock = formatChunksForTutor(chunks)
      }
    }

    let notesForTutor = ""
    if (sourceBlock) {
      notesForTutor =
        sourceBlock +
        (summaryNotes
          ? `\n\n[Study summary — secondary]\n${summaryNotes.slice(0, 2500)}`
          : "")
    } else {
      notesForTutor = summaryNotes
    }

    const stateSummary = learningState
      ? `LEARNING STATE (compact): stage=${learningState.currentStage}; level=${learningState.currentLevel}; understood=${learningState.understoodConcepts.slice(-5).join(", ") || "—"}; struggling=${learningState.strugglingConcepts.slice(-5).join(", ") || "—"}; next=${learningState.nextRecommendedAction}`
      : ""

    const pendingCheck =
      action === "submit_answer" && lastQuestion
        ? `PENDING CHECK: questionId=${lastQuestion.questionId || "?"}; expectedAnswer=${lastQuestion.expectedAnswer || "(judge qualitatively)"}; prompt=${lastQuestion.prompt || ""}`
        : ""

    const answerLine =
      action === "submit_answer" && hasAnswer
        ? `STUDENT ANSWER PAYLOAD: questionId=${String((answer as { questionId?: string }).questionId || "")}; text=${String((answer as { text?: string }).text || "")}`
        : ""

    const userContent =
      buildTutorUserContent({
        message: textMessage,
        notes: notesForTutor,
        topic: topicStr,
        transcript,
        studentName: name,
        firstMessage: Boolean(firstMessage) || action === "start_lesson",
        userTurns: recent.filter((m) => m.role === "user").length,
      }) +
      (stateSummary ? `\n\n${stateSummary}` : "") +
      (pendingCheck ? `\n\n${pendingCheck}` : "") +
      (answerLine ? `\n\n${answerLine}` : "")

    const result = await callGemini({
      systemInstruction,
      parts: [{ text: userContent }],
      json: true,
      maxOutputTokens: 6144,
      timeoutMs: 50000,
    })

    if (!result.ok) {
      console.error("Tutor error:", result.error)
      return NextResponse.json({ error: providerBusyMessage() }, { status: 503 })
    }

    // Parse structured JSON; fall back to plain text reply
    let blocks: LessonBlock[] = []
    let evaluation = null as ReturnType<typeof parseEvaluation>
    let reply = result.text

    const parsed = parseJson<{
      replyMarkdown?: unknown
      statePatch?: Partial<LearningState>
      blocks?: unknown
      evaluation?: unknown
    }>(result.text)

    if (parsed) {
      blocks = parseLessonBlocks(parsed.blocks)
      evaluation = parseEvaluation(parsed.evaluation)
      if (blocks.length > 0) {
        reply = blocksToMarkdown(blocks)
      } else if (typeof parsed.replyMarkdown === "string" && parsed.replyMarkdown.trim()) {
        reply = parsed.replyMarkdown.trim()
      }
      if (learningState) {
        learningState = mergeLearningState(learningState, parsed.statePatch)
        if (evaluation) {
          const mapped =
            evaluation.result === "correct"
              ? "correct"
              : evaluation.result === "partially_correct"
                ? "partial"
                : "incorrect"
          learningState = mergeLearningState(learningState, {
            recentPerformance: [
              { questionId: evaluation.questionId || "check", result: mapped },
            ],
            nextRecommendedAction:
              evaluation.recommendedAction === "explain_differently"
                ? "explain_differently"
                : evaluation.recommendedAction === "give_hint"
                  ? "give_hint"
                  : evaluation.recommendedAction === "practice"
                    ? "practice"
                    : "continue",
            currentStage: "evaluate",
          })
        }
      }
    } else {
      // Model returned prose — still usable
      reply = result.text
    }

    // Track last check for next submit_answer
    const checkBlock = blocks.find((b) => b.type === "understanding_check")
    const nextLastQuestion =
      checkBlock && checkBlock.type === "understanding_check"
        ? {
            questionId: checkBlock.questionId,
            expectedAnswer: checkBlock.expectedAnswer || null,
            prompt: checkBlock.prompt,
          }
        : action === "submit_answer"
          ? null
          : lastQuestion

    // Persist session (soft-fail)
    if (sessionId && learningState) {
      const { error: upErr } = await supabase
        .from("tutor_sessions")
        .update({
          topic: topicStr,
          preferred_level: teachingLevel,
          current_level: learningState.currentLevel,
          current_stage: learningState.currentStage,
          state: learningState,
          last_question: nextLastQuestion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("user_id", user.id)
      if (upErr) console.warn("tutor_sessions update:", upErr.message)
    }

    // Save chat messages (existing table)
    if (materialIdStr) {
      const rows = [
        {
          user_id: user.id,
          material_id: materialIdStr,
          topic: topicStr,
          role: "user" as const,
          content: textMessage.slice(0, 8000),
        },
        {
          user_id: user.id,
          material_id: materialIdStr,
          topic: topicStr,
          role: "assistant" as const,
          content: reply.slice(0, 16000),
        },
      ]
      const { error: saveError } = await supabase.from("tutor_messages").insert(rows)
      if (saveError) console.error("tutor_messages save:", saveError.message)
    }

    return NextResponse.json({
      reply,
      model: result.model,
      level: teachingLevel,
      sessionId,
      retrievedChunks: retrievalCount,
      state: learningState
        ? {
            currentStage: learningState.currentStage,
            preferredLevel: learningState.preferredLevel,
            currentLevel: learningState.currentLevel,
            nextRecommendedAction: learningState.nextRecommendedAction,
            understoodConcepts: learningState.understoodConcepts.slice(-8),
            strugglingConcepts: learningState.strugglingConcepts.slice(-8),
          }
        : null,
      lesson: blocks.length
        ? {
            topicTitle: topicStr,
            blocks: publicBlocks(blocks),
          }
        : null,
      evaluation,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
