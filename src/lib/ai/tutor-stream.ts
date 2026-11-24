// PATH: src/lib/ai/tutor-stream.ts
/**
 * Reads the Tutor's streamed answer while it is still being written.
 *
 * The AI answers in this plain-text shape (never JSON, so nothing half-finished can leak):
 *
 *   @@EVALUATION        (only when checking a student's answer)
 *   {one line of JSON}
 *   @@REPLY
 *   Markdown the student reads — streamed to the screen as it arrives
 *   @@STATE
 *   {one line of JSON: statePatch + the next understanding check}
 *
 * If the AI ignores the format we still cope: plain prose is shown as it is, and a JSON
 * answer is handed back untouched so the route can use the older JSON reader.
 */

export type StreamMode = "undecided" | "markers" | "plain" | "json"

export type StreamOutcome = {
  mode: StreamMode
  /** Everything the AI sent, exactly as received */
  raw: string
  /** The student-facing text (markers mode and plain mode) */
  reply: string
  evaluationText: string
  stateText: string
}

type Section = "none" | "evaluation" | "reply" | "state"

const MARKER = /^@@(EVALUATION|REPLY|STATE)[ \t]*$/

// A line that only says "Correct!", "Not quite." and so on. The verdict card already says it.
const VERDICT_ONLY_LINE =
  /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:that(?:'s| is)\s+)?(?:correct|right|incorrect|wrong|exactly|well done|great job|good job|not quite|partly correct|partially correct|almost)(?:\s+answer)?\s*[!.:✅❌✓✔]*\s*(?:\*\*|__)?\s*$/i

export function isVerdictOnlyLine(line: string): boolean {
  return VERDICT_ONLY_LINE.test(line)
}

/** Drops a leading line that only says "Correct!" etc. */
export function stripLeadingVerdict(markdown: string): string {
  const lines = markdown.replace(/\r/g, "").split("\n")
  let i = 0
  while (i < lines.length && lines[i].trim() === "") i++
  if (i < lines.length && isVerdictOnlyLine(lines[i])) {
    const rest = lines.slice(i + 1).join("\n").trim()
    if (rest) return rest
  }
  return markdown
}

export class TutorStreamParser {
  private mode: StreamMode = "undecided"
  private raw = ""
  private head = ""
  private section: Section = "none"
  private lineBuf = ""
  private emittedOfLine = 0
  private evalText = ""
  private stateText = ""
  private replyText = ""
  private replyStarted = false
  private evaluationSeen = false
  private evaluationEmitted = false

  constructor(
    private readonly cb: {
      /** New text for the student. `full` is everything shown so far. */
      onContent: (text: string, full: string) => void
      /** The evaluation JSON is complete (before the reply text starts). */
      onEvaluationText: (json: string) => void
    }
  ) {}

  feed(chunk: string): void {
    if (!chunk) return
    this.raw += chunk

    if (this.mode === "undecided") {
      this.head += chunk
      const t = this.head.replace(/^\s+/, "")
      const quick = t.startsWith("@@") || /^[[{]/.test(t)
      if (t.length < 3 && !quick) return
      this.mode = t.startsWith("@@") ? "markers" : /^[[{]/.test(t) || t.startsWith("```") ? "json" : "plain"
      const held = this.head
      this.head = ""
      if (this.mode === "markers") this.consume(held)
      else if (this.mode === "plain") this.emitReply(held)
      return
    }
    if (this.mode === "markers") this.consume(chunk)
    else if (this.mode === "plain") this.emitReply(chunk)
  }

  finish(): StreamOutcome {
    if (this.mode === "undecided") {
      if (this.head.trim()) {
        this.mode = "plain"
        this.emitReply(this.head)
      }
      this.head = ""
    }
    if (this.mode === "markers") {
      if (this.lineBuf) {
        const line = this.lineBuf.replace(/\r$/, "")
        const already = this.emittedOfLine
        this.lineBuf = ""
        this.emittedOfLine = 0
        this.handleLine(line, already)
      }
      this.flushEvaluation()
    }
    return {
      mode: this.mode,
      raw: this.raw,
      reply: this.replyText.trim(),
      evaluationText: this.evalText.trim(),
      stateText: this.stateText.trim(),
    }
  }

  // ---- markers mode ----

  private consume(text: string): void {
    this.lineBuf += text.replace(/\r/g, "")
    let nl: number
    while ((nl = this.lineBuf.indexOf("\n")) !== -1) {
      const line = this.lineBuf.slice(0, nl)
      const already = this.emittedOfLine
      this.lineBuf = this.lineBuf.slice(nl + 1)
      this.emittedOfLine = 0
      this.handleLine(line, already)
    }
    this.emitPartial()
  }

  private handleLine(line: string, already: number): void {
    const marker = line.match(MARKER)
    if (marker) {
      this.flushEvaluation()
      this.section = marker[1].toLowerCase() as Section
      if (this.section === "evaluation") this.evaluationSeen = true
      return
    }
    if (this.section === "evaluation") this.evalText += line + "\n"
    else if (this.section === "state") this.stateText += line + "\n"
    else if (this.section === "reply") this.replyLine(line, already)
    // text before the first marker is ignored
  }

  private replyLine(line: string, already: number): void {
    if (!this.replyStarted) {
      if (line.trim() === "") return
      this.replyStarted = true
      if (this.evaluationSeen && isVerdictOnlyLine(line)) return
      this.emitReply(line + "\n")
      return
    }
    this.emitReply((line + "\n").slice(already))
  }

  // Shows the start of a long line before its end arrives (never a line that could be a marker)
  private emitPartial(): void {
    if (this.section !== "reply" || this.lineBuf === "" || this.lineBuf.startsWith("@")) return
    if (!this.replyStarted) {
      // a bare verdict line is short; anything longer is real teaching text
      if (this.lineBuf.length <= 80) return
      this.replyStarted = true
    }
    const fresh = this.lineBuf.slice(this.emittedOfLine)
    if (!fresh) return
    this.emittedOfLine = this.lineBuf.length
    this.emitReply(fresh)
  }

  private flushEvaluation(): void {
    if (this.section === "evaluation" && !this.evaluationEmitted) {
      this.evaluationEmitted = true
      this.cb.onEvaluationText(this.evalText.trim())
    }
  }

  private emitReply(text: string): void {
    if (!text) return
    this.replyText += text
    this.cb.onContent(text, this.replyText)
  }
}
