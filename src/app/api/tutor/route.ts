// PATH: src/app/api/tutor/route.ts
import { NextRequest, NextResponse } from "next/server"
import { streamGemini, parseJson } from "@/lib/ai/gemini"
import { TutorStreamParser, stripLeadingVerdict, type StreamOutcome } from "@/lib/ai/tutor-stream"
import { sealSecret, openSecret } from "@/lib/ai/secret-box"
import { createClient } from "@/lib/supabase/server"
import { providerBusyMessage, TUTOR_PROTECTION } from "@/lib/ai/limits"
import { sharedRateLimit, acquireGenerationSlot, logAiUsage, type Slot } from "@/lib/ai/usage"
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

function streamProtocolSpec(): string {
  return `OUTPUT FORMAT — reply in EXACTLY this plain-text layout. Do NOT output JSON for the whole reply and do not wrap anything in code fences.

@@EVALUATION
{"questionId":"q1","result":"correct","feedback":"1-3 specific sentences","recommendedAction":"continue","misconception":{"detected":false,"label":"","explanation":""}}
@@REPLY
(the teaching text in Markdown)
@@STATE
{"statePatch":{"currentStage":"explain"},"check":null}

Rules:
- Include the @@EVALUATION section ONLY when ACTION is submit_answer, as ONE line of JSON. result is correct | partially_correct | incorrect. recommendedAction is continue | explain_differently | give_hint | practice. For every other action leave the whole @@EVALUATION section out.
- @@REPLY is what the student reads. Wherever the ACTION text above says "blocks", write that teaching here as Markdown. Teach directly. Never mention these section names. Never repeat the verdict from the evaluation. Never put the understanding check in the reply text.
- @@STATE is ONE line of compact JSON. statePatch may contain: currentStage (orient|explain|demonstrate|check|evaluate|adapt|consolidate), currentLevel (very_simple|standard|advanced|exam_ready), understoodConcepts[], strugglingConcepts[], misconceptions[{concept,description,evidence}], recentPerformance[{questionId,result: correct|partial|incorrect}], nextRecommendedAction (continue|explain_differently|give_hint|practice|recap), completedSections[].
- check is null, or ONE understanding check: {"questionId":"q2","prompt":"question text","answerType":"single_choice","options":[{"id":"a","text":"..."},{"id":"b","text":"..."}],"expectedAnswer":"a"}. Wherever the ACTION text says "understanding_check", this check object is it. Never put the answer in the prompt or options.
- The three marker lines (@@EVALUATION, @@REPLY, @@STATE) must each be alone on their own line.
- Plain-text math only (no LaTeX $...$).`
}

// Vercel stops the function after this many seconds
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  let slot: Slot | null = null
  let metricAction = "student_message"
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Please log in again." }, { status: 401 })
    }

    // 1) Read and validate the request first. Oversized or malformed requests stop here.
    if (Number(req.headers.get("content-length") || 0) > 200_000) {
      return NextResponse.json({ error: "That request is too large." }, { status: 413 })
    }
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

    // 2) Abuse protection. There is NO daily message cap for the Tutor: students can study for hours.
    //    These limits only stop scripts: a burst per minute, a ceiling per hour, and at most
    //    a couple of answers being written at the same moment. If the counters themselves fail,
    //    the student is let through (and it is logged).
    const burst = await sharedRateLimit(
      supabase, user.id, "tutor-burst", TUTOR_PROTECTION.burstMax, TUTOR_PROTECTION.burstWindowSec
    )
    if (!burst.ok) {
      console.warn(JSON.stringify({ type: "tutor_abuse_signal", rule: "burst", user: user.id }))
      return NextResponse.json(
        { error: `You are sending messages very fast. Please wait ${burst.retryAfterSec} seconds, then continue.` },
        { status: 429, headers: { "Retry-After": String(burst.retryAfterSec) } }
      )
    }
    const hourly = await sharedRateLimit(
      supabase, user.id, "tutor-hour", TUTOR_PROTECTION.hourMax, TUTOR_PROTECTION.hourWindowSec
    )
    if (!hourly.ok) {
      console.warn(JSON.stringify({ type: "tutor_abuse_signal", rule: "hour", user: user.id }))
      return NextResponse.json(
        { error: "You have been very active for the last hour. Please pause for a few minutes, then continue — your lesson is saved." },
        { status: 429, headers: { "Retry-After": String(Math.min(hourly.retryAfterSec || 60, 600)) } }
      )
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
      [key: string]: unknown
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
        if (lastQuestion?.expectedAnswer) {
          lastQuestion = { ...lastQuestion, expectedAnswer: openSecret(lastQuestion.expectedAnswer) ?? undefined }
        }
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
      `\n\n${actionInstructions(action)}\n\n${streamProtocolSpec()}`

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

    // ---- Only a couple of answers at a time per student (a second tab is fine) ----
    slot = await acquireGenerationSlot(supabase, TUTOR_PROTECTION.concurrent, 90)
    if (!slot.ok) {
      slot = null
      return NextResponse.json(
        { error: "Your last answer is still being written. Please wait a moment." },
        { status: 429 }
      )
    }

    // ---- Ask the AI. The answer streams back piece by piece. ----
    // Stops if the student leaves (req.signal) so nothing is wasted or saved twice.
    const abort = new AbortController()
    req.signal.addEventListener("abort", () => abort.abort(), { once: true })
    const started = await streamGemini({
      systemInstruction,
      parts: [{ text: userContent }],
      maxOutputTokens: tokenBudgetFor(action),
      timeoutMs: 40000,
      signal: abort.signal,
    })

    if (!started.ok) {
      console.error("Tutor error:", started.error)
      const category = abort.signal.aborted ? "cancelled" : classifyTutorFailure(started.error)
      logTutorMetric({ action: metricAction, durationMs: Date.now() - t0, ok: false, failureCategory: category })
      void logAiUsage(supabase, { feature: "tutor", durationMs: Date.now() - t0, ok: false, errorCategory: category })
      await slot.release()
      slot = null
      // A temporary provider problem — never shown as a "limit reached" message
      return NextResponse.json({ error: providerBusyMessage() }, { status: 503 })
    }
    const releaseSlot = slot.release
    slot = null // from here the stream owns the slot

    const model = started.model
    const startedChunks = started.chunks
    const userIdForSave = user.id
    const incomingLastQuestion = lastQuestion
    const learningStateAtStart = learningState
    const finalSessionId = sessionId

    /** Turns the finished answer into the saved + returned result. Throws a student-friendly message. */
    const finalizeTurn = async (first: StreamOutcome) => {
      let outcome = first
      let blocks: LessonBlock[] = []
      let evaluation = null as ReturnType<typeof parseEvaluation>
      let reply = ""
      let statePatch: Partial<LearningState> | undefined
      let parseOk = true

      // The AI wrapped the format in a code fence: unwrap and read it as normal
      if (outcome.mode === "json") {
        const unfenced = outcome.raw.replace(/^\s*```[a-z]*\s*\n/i, "").replace(/\n?```\s*$/, "")
        if (unfenced.includes("@@REPLY")) {
          const again = new TutorStreamParser({ onContent: () => {}, onEvaluationText: () => {} })
          again.feed(unfenced)
          outcome = again.finish()
        }
      }

      if (outcome.mode === "markers") {
        reply = outcome.reply
        evaluation = outcome.evaluationText ? parseEvaluation(parseJson(outcome.evaluationText)) : null
        const st = outcome.stateText
          ? parseJson<{ statePatch?: Partial<LearningState>; check?: unknown }>(outcome.stateText)
          : null
        statePatch = st?.statePatch
        if (st?.check && typeof st.check === "object") {
          blocks = parseLessonBlocks([{ ...(st.check as object), type: "understanding_check" }])
        }
      } else if (outcome.mode === "json") {
        // Older JSON-style answer
        const parsed = parseJson<{
          replyMarkdown?: unknown
          statePatch?: Partial<LearningState>
          blocks?: unknown
          evaluation?: unknown
        }>(outcome.raw)
        if (!parsed) {
          console.error("Tutor structured parse failed; suppressing raw output")
          logTutorMetric({
            action: metricAction,
            durationMs: Date.now() - t0,
            ok: false,
            failureCategory: "validation",
            validationFailed: true,
          })
          throw new Error(friendlyTutorFailure())
        }
        blocks = parseLessonBlocks(parsed.blocks)
        evaluation = parseEvaluation(parsed.evaluation)
        const fromBlocks = blocksToMarkdown(blocks)
        const fromMd = typeof parsed.replyMarkdown === "string" ? parsed.replyMarkdown.trim() : ""
        reply = fromBlocks || fromMd
        statePatch = parsed.statePatch
        parseOk = false
      } else {
        // Plain teaching text
        reply = outcome.reply
        parseOk = false
      }

      if (!reply.trim() && blocks.some((b) => b.type === "understanding_check")) {
        reply = "Your turn — try the check below."
      }

      let nextState = learningStateAtStart
      if (nextState) {
        nextState = mergeLearningState(nextState, statePatch)
        if (evaluation) {
          const mapped =
            evaluation.result === "correct"
              ? "correct"
              : evaluation.result === "partially_correct"
                ? "partial"
                : "incorrect"
          nextState = mergeLearningState(nextState, {
            recentPerformance: [{ questionId: evaluation.questionId || "check", result: mapped }],
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
        throw new Error(friendlyTutorFailure())
      }

      // Track the open question for the next submit_answer (answer key is stored encrypted)
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
            : incomingLastQuestion
      const savedLastQuestion = nextLastQuestion
        ? {
            ...nextLastQuestion,
            expectedAnswer: sealSecret(
              typeof nextLastQuestion.expectedAnswer === "string" ? nextLastQuestion.expectedAnswer : null
            ),
          }
        : null

      // Persist session (soft-fail)
      if (finalSessionId && nextState) {
        const { error: upErr } = await supabase
          .from("tutor_sessions")
          .update({
            topic: topicStr,
            preferred_level: teachingLevel,
            current_level: nextState.currentLevel,
            current_stage: nextState.currentStage,
            state: nextState,
            last_question: savedLastQuestion,
            updated_at: new Date().toISOString(),
          })
          .eq("id", finalSessionId)
          .eq("user_id", userIdForSave)
        if (upErr) console.warn("tutor_sessions update:", upErr.message)
      }

      // Save chat messages (existing table)
      if (materialIdStr) {
        const rows = [
          {
            user_id: userIdForSave,
            material_id: materialIdStr,
            topic: topicStr,
            role: "user" as const,
            content: textMessage.slice(0, 8000),
          },
          {
            user_id: userIdForSave,
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

      void logAiUsage(supabase, {
        feature: "tutor",
        model,
        inputTokens: started.usage.inputTokens,
        outputTokens: started.usage.outputTokens,
        durationMs: Date.now() - t0,
        ok: true,
      })

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

      return {
        reply,
        model,
        level: teachingLevel,
        sessionId: finalSessionId,
        retrievedChunks: retrievalCount,
        state: nextState
          ? {
              currentStage: nextState.currentStage,
              preferredLevel: nextState.preferredLevel,
              currentLevel: nextState.currentLevel,
              nextRecommendedAction: nextState.nextRecommendedAction,
              understoodConcepts: nextState.understoodConcepts.slice(-8),
              strugglingConcepts: nextState.strugglingConcepts.slice(-8),
            }
          : null,
        lesson: blocks.length ? { topicTitle: topicStr, blocks: publicBlocks(blocks) } : null,
        evaluation,
      }
    }

    // ---- Send the answer to the phone as it is written ----
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false
        const send = (event: string, data: unknown) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          } catch {
            closed = true // the student left; we still finish and save the lesson turn
          }
        }
        let sentEvaluation = false
        try {
          const parser = new TutorStreamParser({
            onContent: (text, full) => send("content", { text, full }),
            onEvaluationText: (json) => {
              const ev = json ? parseEvaluation(parseJson(json)) : null
              if (ev) {
                sentEvaluation = true
                send("evaluation", ev)
              }
            },
          })
          for await (const piece of startedChunks) parser.feed(piece)

          const payload = await finalizeTurn(parser.finish())
          if (payload.evaluation && !sentEvaluation) send("evaluation", payload.evaluation)
          if (payload.lesson) send("lesson", payload.lesson)
          if (payload.state) send("state", payload.state)
          send("done", payload)
        } catch (err) {
          const cancelled = abort.signal.aborted
          console.error("Tutor stream error:", cancelled ? "cancelled by student" : err)
          logTutorMetric({
            action: metricAction,
            durationMs: Date.now() - t0,
            ok: false,
            failureCategory: cancelled ? "cancelled" : "exception",
          })
          // A failed or cancelled answer is logged as not-ok and saves nothing, so nothing is duplicated
          void logAiUsage(supabase, {
            feature: "tutor",
            model,
            inputTokens: started.usage.inputTokens,
            outputTokens: started.usage.outputTokens,
            durationMs: Date.now() - t0,
            ok: false,
            errorCategory: cancelled ? "cancelled" : "stream_error",
          })
          const message =
            err instanceof Error && err.message === friendlyTutorFailure()
              ? err.message
              : "The answer was cut off. Please try again."
          send("error", { message })
        } finally {
          await releaseSlot()
          try {
            controller.close()
          } catch {
            // already closed
          }
        }
      },
      cancel() {
        // The student closed the page or lost signal: stop the AI call
        abort.abort()
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (err) {
    console.error(err)
    await slot?.release()
    logTutorMetric({
      action: metricAction,
      durationMs: Date.now() - t0,
      ok: false,
      failureCategory: "exception",
    })
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
