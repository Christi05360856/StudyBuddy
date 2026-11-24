// PATH: src/app/api/tutor/route.ts
import { NextRequest, NextResponse } from "next/server"
import { callGemini, parseJson } from "@/lib/ai/gemini"
import { createClient } from "@/lib/supabase/server"
import { checkAiCredit, rateLimit, providerBusyMessage } from "@/lib/ai/limits"
import {
  buildTutorSystemInstruction,
  buildTutorUserContent,
  normalizeLevel,
} from "@/lib/ai/tutor-policy"
import { formatChunksForTutor, retrieveMaterialChunks } from "@/lib/ai/retrieval"
import { logTutorMetric, classifyTutorFailure } from "@/lib/ai/tutor-metrics"
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

/** True if text looks like model JSON rather than student-facing prose. */
function looksLikeStructuredPayload(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (t.startsWith("{") || t.startsWith("[")) return true
  if (t.includes('"replyMarkdown"') || t.includes('"statePatch"') || t.includes('"blocks"')) return true
  if (t.includes("```json")) return true
  return false
}

const VERDICT_WORD =
  "(?:that(?:'s| is)\\s+)?(?:correct|right|incorrect|wrong|exactly|well done|great job|good job|not quite|partly correct|partially correct|almost)(?:\\s+answer)?"
const VERDICT_ONLY_LINE = new RegExp(
  `^\\s*(?:#{1,6}\\s*)?(?:\\*\\*|__)?\\s*${VERDICT_WORD}\\s*[!.:✅❌✓✔]*\\s*(?:\\*\\*|__)?\\s*$`,
  "i"
)

/** Drops a leading line that only says "Correct!" etc. — the verdict card already says it. */
function stripLeadingVerdict(markdown: string): string {
  const lines = markdown.replace(/\r/g, "").split("\n")
  let i = 0
  while (i < lines.length && lines[i].trim() === "") i++
  if (i < lines.length && VERDICT_ONLY_LINE.test(lines[i])) {
    const rest = lines.slice(i + 1).join("\n").trim()
    if (rest) return rest
  }
  return markdown
}

function verdictLabel(result: string): string {
  if (result === "correct") return "Correct"
  if (result === "partially_correct") return "Partly correct"
  return "Incorrect"
}

function friendlyTutorFailure(): string {
  return "I had trouble putting that lesson together. Please tap retry — your notes and topic are still here."
}

function tokenBudgetFor(action: string): number {
  switch (action) {
    case "request_hint":
      return 1536
    case "recap":
      return 2048
    case "submit_answer":
      return 3072
    case "request_reexplanation":
      return 3072
    case "start_lesson":
      return 4096
    default:
      return 3072
  }
}

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
The evaluation is shown to the student as a verdict card ABOVE your blocks, so do NOT repeat the verdict in the blocks: no block titled "Correct!" / "Incorrect" / "Not quite", and no opening line that only says right or wrong. Start the blocks directly with the next teaching step.
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

// Vercel stops the function after this many seconds
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  let metricAction = "student_message"
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Please log in again." }, { status: 401 })
    }

    // 1) Read and validate the request FIRST, so bad requests never cost a credit
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 })
    }
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
    metricAction = action

    const textMessage =
      typeof message === "string"
        ? message.trim()
        : hasAnswer
          ? `My answer to ${(answer as { questionId?: string }).questionId || "the check"}: ${String((answer as { text?: string }).text || "")}`
          : ""

    if (!textMessage || textMessage.length > 4000) {
      return NextResponse.json({ error: "message required" }, { status: 400 })
    }

    // 2) Burst protection, then the daily credit (fails closed on unexpected errors)
    const burst = rateLimit(`tutor:${user.id}`, 10, 60_000)
    if (!burst.ok) {
      return NextResponse.json(
        { error: `You are sending messages too fast. Please wait ${burst.retryAfterSec} seconds.` },
        { status: 429, headers: { "Retry-After": String(burst.retryAfterSec) } }
      )
    }
    const credit = await checkAiCredit(supabase, "tutor")
    if (!credit.ok) {
      return NextResponse.json({ error: credit.message }, { status: credit.status })
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
      maxOutputTokens: tokenBudgetFor(action),
      timeoutMs: 30000,
    })

    if (!result.ok) {
      console.error("Tutor error:", result.error)
      logTutorMetric({
        action: metricAction,
        durationMs: Date.now() - t0,
        ok: false,
        failureCategory: classifyTutorFailure(result.error),
      })
      return NextResponse.json({ error: providerBusyMessage() }, { status: 503 })
    }

    // Parse structured JSON — NEVER surface raw model JSON to the student
    let blocks: LessonBlock[] = []
    let evaluation = null as ReturnType<typeof parseEvaluation>
    let reply = ""
    let parseOk = false

    let modelText = result.text
    let parsed = parseJson<{
      replyMarkdown?: unknown
      statePatch?: Partial<LearningState>
      blocks?: unknown
      evaluation?: unknown
    }>(modelText)

    // One recovery attempt if the model returned invalid JSON for a structured call
    // Only retry when there is still time, so the student never waits more than about 45 seconds in total
    if (!parsed && looksLikeStructuredPayload(modelText) && Date.now() - t0 < 20000) {
      const retry = await callGemini({
        systemInstruction:
          systemInstruction +
          "\n\nYour previous reply was invalid JSON. Reply again with ONLY valid JSON matching the schema. No markdown fences.",
        parts: [{ text: userContent }],
        json: true,
        maxOutputTokens: tokenBudgetFor(action),
        timeoutMs: 15000,
      })
      if (retry.ok) {
        modelText = retry.text
        parsed = parseJson(modelText)
      }
    }

    if (parsed) {
      parseOk = true
      blocks = parseLessonBlocks(parsed.blocks)
      evaluation = parseEvaluation(parsed.evaluation)
      const fromBlocks = blocksToMarkdown(blocks)
      const fromMd =
        typeof parsed.replyMarkdown === "string" ? parsed.replyMarkdown.trim() : ""
      reply = fromBlocks || fromMd
      // If only a check was returned, give a short neutral lead-in (check renders separately)
      if (!reply && blocks.some((b) => b.type === "understanding_check")) {
        reply = "Your turn — try the check below."
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
    } else if (!looksLikeStructuredPayload(modelText)) {
      // Genuine plain-text teaching reply
      reply = modelText.trim()
      parseOk = true
    } else {
      // Still looks like JSON / internal payload — do not show it
      console.error("Tutor structured parse failed; suppressing raw output")
      logTutorMetric({
        action: metricAction,
        durationMs: Date.now() - t0,
        ok: false,
        failureCategory: "validation",
        validationFailed: true,
      })
      return NextResponse.json(
        {
          error: friendlyTutorFailure(),
          retryable: true,
          sessionId,
        },
        { status: 422 }
      )
    }

    // The verdict card shows "Correct!" etc. at the top, so the text must not repeat it
    if (evaluation) reply = stripLeadingVerdict(reply)

    if (!reply.trim()) {
      reply =
        evaluation?.feedback ||
        "Let me know what part you want to go over, or pick an option below if there is a check."
    }

    // Final safety: never leak JSON-looking strings
    if (looksLikeStructuredPayload(reply)) {
      console.error("Tutor reply still looked structured after normalize")
      return NextResponse.json(
        { error: friendlyTutorFailure(), retryable: true, sessionId },
        { status: 422 }
      )
    }

    // Track last check for next submit_answer
    const checkBlock = blocks.find((b) => b.type === "understanding_check")
    const nextLastQuestion =
      checkBlock && checkBlock.type === "understanding_check"
        ? {
            questionId: checkBlock.questionId,
            expectedAnswer: checkBlock.expectedAnswer || null,
            prompt: checkBlock.prompt,
            // Saved so the question can be shown again when the student reopens the topic
            answerType: checkBlock.answerType,
            options: checkBlock.options ?? null,
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
          // The verdict card is not stored, so keep the verdict as the first line when the chat is reopened
          content: (evaluation
            ? `**${verdictLabel(evaluation.result)}.** ${evaluation.feedback}\n\n${reply}`
            : reply
          ).slice(0, 16000),
        },
      ]
      const { error: saveError } = await supabase.from("tutor_messages").insert(rows)
      if (saveError) console.error("tutor_messages save:", saveError.message)
    }

    logTutorMetric({
      action: metricAction,
      level: teachingLevel,
      durationMs: Date.now() - t0,
      ok: true,
      retrievedChunks: retrievalCount,
      hadBlocks: blocks.length > 0,
      hadEvaluation: Boolean(evaluation),
      validationFailed: !parseOk,
    })

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
    logTutorMetric({
      action: metricAction,
      durationMs: Date.now() - t0,
      ok: false,
      failureCategory: "exception",
    })
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
