// PATH: src/app/(dashboard)/tutor/page.tsx
"use client"

import { useState, useRef, useEffect, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { BottomNav } from "@/components/bottom-nav"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Send, ArrowLeft, Check, Folder, FolderOpen, ChevronDown, FileText } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { HeadphonesButton } from "@/components/music/headphones-button"
import {
  EvaluationCard,
  UnderstandingCheckCard,
  TutorBubble,
  TutorThinking,
  TopicListSkeleton,
  CourseFolderSkeleton,
  DaySeparator,
  formatDayLabel,
  type ThinkingMode,
} from "@/components/tutor/lesson-blocks"
import {
  LevelChips,
  LessonProgressBar,
  TopicOutline,
  OutlineToggleButton,
  SectionsOverlay,
  type LessonLevel,
} from "@/components/tutor/lesson-sidebar"

type Message = {
  role: "user" | "assistant"
  content: string
  createdAt?: number
  evaluation?: {
    result: string
    feedback: string
    misconception?: { detected: boolean; label?: string; explanation?: string }
  } | null
  check?: {
    questionId: string
    prompt: string
    answerType: "single_choice" | "short_text"
    options?: { id: string; text: string }[]
  } | null
  /** When set, the check on this message is locked after answer */
  checkLocked?: boolean
  selectedAnswer?: string
}

type FolderCourse = { id: string; code: string; title: string | null }
type FolderNote = { id: string; title: string; course_id: string }

function doneKey(materialId: string) {
  return `sb_tutor_done_${materialId}`
}

function loadDoneTopics(materialId: string): Set<string> {
  try {
    const raw = localStorage.getItem(doneKey(materialId))
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveDoneTopics(materialId: string, set: Set<string>) {
  try {
    localStorage.setItem(doneKey(materialId), JSON.stringify([...set]))
  } catch {
    // storage blocked
  }
}


// The AI Tutor home: one folder per course, with its ready notes inside
function CourseFolders() {
  const supabase = createClient()
  const [courses, setCourses] = useState<FolderCourse[]>([])
  const [notes, setNotes] = useState<FolderNote[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const [coursesRes, notesRes] = await Promise.all([
        supabase
          .from("courses")
          .select("id, code, title")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("materials")
          .select("id, title, course_id, page_count")
          .eq("user_id", user.id)
          .eq("status", "ready")
          .order("created_at", { ascending: false }),
      ])

      const list = coursesRes.data ?? []
      setCourses(list)
      // Only notes the AI has finished preparing can be studied
      setNotes((notesRes.data ?? []).filter((n) => n.page_count))
      if (list.length === 1) setOpenId(list[0].id)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-5 pt-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">AI Tutor</h1>
            <p className="text-sm text-gray-500 mt-1 mb-6">
              Open a course folder and pick a note to study with your tutor.
            </p>
          </div>
          <HeadphonesButton />
        </div>

        {loading ? (
          <CourseFolderSkeleton />
        ) : courses.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <p className="text-gray-500 text-sm">You have no courses yet.</p>
            <Link href="/courses">
              <Button>Add a course</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((c) => {
              const courseNotes = notes.filter((n) => n.course_id === c.id)
              const open = openId === c.id
              return (
                <div key={c.id} className="rounded-2xl bg-card border border-border overflow-hidden">
                  <button
                    onClick={() => setOpenId(open ? null : c.id)}
                    aria-expanded={open}
                    className="w-full flex items-center gap-4 p-4 text-left"
                  >
                    <div className="w-12 h-12 shrink-0 rounded-xl bg-accent-soft flex items-center justify-center">
                      {open ? (
                        <FolderOpen size={22} className="text-amber-700" />
                      ) : (
                        <Folder size={22} className="text-amber-700" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{c.code}</p>
                      <p className="text-sm text-gray-500 truncate">
                        {c.title ? `${c.title} · ` : ""}
                        {courseNotes.length} {courseNotes.length === 1 ? "note" : "notes"}
                      </p>
                    </div>
                    <ChevronDown
                      size={18}
                      className={cn("text-gray-400 shrink-0 transition-transform", open && "rotate-180")}
                    />
                  </button>

                  {open && (
                    <div className="border-t border-border bg-muted/40 p-3 space-y-2">
                      {courseNotes.length === 0 ? (
                        <p className="text-sm text-gray-500 px-1 py-2">
                          No notes ready yet.{" "}
                          <Link href={`/courses/${c.id}`} className="text-primary font-medium">
                            Upload notes
                          </Link>
                        </p>
                      ) : (
                        courseNotes.map((n) => (
                          <Link
                            key={n.id}
                            href={`/tutor?material=${n.id}`}
                            className="flex items-center gap-3 px-3 py-3 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors"
                          >
                            <FileText size={16} className="text-gray-400 shrink-0" />
                            <span className="text-sm font-medium truncate flex-1">{n.title}</span>
                            <span className="text-xs text-primary font-medium shrink-0">Study</span>
                          </Link>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}


function extractCheck(data: {
  lesson?: { blocks?: { type?: string; questionId?: string; prompt?: string; answerType?: string; options?: { id: string; text: string }[] }[] }
}): Message["check"] {
  const blocks = data?.lesson?.blocks
  if (!Array.isArray(blocks)) return null
  const c = blocks.find((b) => b.type === "understanding_check")
  if (!c || !c.prompt || !c.questionId) return null
  return {
    questionId: c.questionId,
    prompt: c.prompt,
    answerType: c.answerType === "short_text" ? "short_text" : "single_choice",
    options: c.options,
  }
}

async function readTutorResponse(
  res: Response,
  onPartial?: (full: string) => void
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const ctype = res.headers.get("content-type") || ""
  if (ctype.includes("text/event-stream") && res.body) {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let full = ""
    const data: Record<string, unknown> = { reply: "" }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split("\n\n")
      buffer = parts.pop() || ""
      for (const block of parts) {
        const lines = block.split("\n")
        let event = "message"
        let payload = ""
        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim()
          if (line.startsWith("data:")) payload += line.slice(5).trim()
        }
        if (!payload) continue
        try {
          const parsed = JSON.parse(payload) as Record<string, unknown>
          if (event === "content") {
            full = String(parsed.full || full + String(parsed.text || ""))
            data.reply = full
            onPartial?.(full)
          } else if (event === "evaluation") data.evaluation = parsed
          else if (event === "lesson") data.lesson = parsed
          else if (event === "state") data.state = parsed
          else if (event === "done") Object.assign(data, parsed)
          else if (event === "error") {
            return { ok: false, status: 422, data: { error: String(parsed.message || "Failed") } }
          }
        } catch {
          /* ignore */
        }
      }
    }
    return { ok: true, status: 200, data }
  }
  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}

function looksLikeJson(text: string): boolean {
  const t = (text || "").trim()
  if (!t) return false
  if (t.startsWith("{") || t.startsWith("[")) return true
  if (t.includes('"replyMarkdown"') || t.includes('"statePatch"') || t.includes('"blocks"')) return true
  return false
}

function stageFrom(data: { state?: { currentStage?: string } | null }): string | null {
  const s = data?.state?.currentStage
  return typeof s === "string" && s ? s : null
}

function prettyStage(stage: string | null): string | undefined {
  if (!stage) return undefined
  return stage.replace(/_/g, " ")
}

// The composer grows with the text up to this height, then scrolls inside itself
const COMPOSER_MAX_PX = 160
// The server rejects anything longer
const MAX_MESSAGE_CHARS = 4000

const LESSON_LEVELS: LessonLevel[] = ["very_simple", "standard", "advanced", "exam_ready"]

/** Rebuilds the open question from what the server saved, or null when there is none. */
function restoreCheck(raw: unknown): Message["check"] {
  if (!raw || typeof raw !== "object") return null
  const q = raw as {
    questionId?: unknown
    prompt?: unknown
    answerType?: unknown
    options?: unknown
  }
  if (typeof q.questionId !== "string" || typeof q.prompt !== "string" || !q.prompt) return null
  const options = Array.isArray(q.options)
    ? q.options
        .map((o) => {
          const item = o as { id?: unknown; text?: unknown }
          return typeof item?.id === "string" && typeof item?.text === "string"
            ? { id: item.id, text: item.text }
            : null
        })
        .filter((o): o is { id: string; text: string } => o !== null)
    : []
  if (q.answerType === "short_text") {
    return { questionId: q.questionId, prompt: q.prompt, answerType: "short_text" }
  }
  // Questions saved before options were stored cannot be shown again
  if (options.length === 0) return null
  return { questionId: q.questionId, prompt: q.prompt, answerType: "single_choice", options }
}

/** Undo a turn that failed: drop the unfinished tutor bubble and the student's own bubble. */
function rollbackTurn(prev: Message[], userText: string | null): Message[] {
  const next = [...prev]
  if (next.length && next[next.length - 1].role === "assistant") next.pop()
  if (
    userText !== null &&
    next.length &&
    next[next.length - 1].role === "user" &&
    next[next.length - 1].content === userText
  ) {
    next.pop()
  }
  return next
}

function TutorContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const materialId = searchParams.get("material")

  const [level, setLevel] = useState<LessonLevel>("standard")
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [materialTitle, setMaterialTitle] = useState<string | null>(null)
  const [context, setContext] = useState("") // the AI's notes about this material
  const [studentName, setStudentName] = useState("") // first name, used in the greeting
  const [topics, setTopics] = useState<string[]>([])
  const [completedTopics, setCompletedTopics] = useState<Set<string>>(new Set())

  // Remember green ticks per note across refresh (still free to re-open any topic)
  useEffect(() => {
    if (!materialId) return
    setCompletedTopics(loadDoneTopics(materialId))
  }, [materialId])
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [pendingCheck, setPendingCheck] = useState<Message["check"]>(null)
  const [checkBusy, setCheckBusy] = useState(false)
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("default")
  const [sendError, setSendError] = useState<string | null>(null)
  const [isTouch, setIsTouch] = useState(false) // phones/tablets: Enter = new line
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [lessonStage, setLessonStage] = useState<string | null>(null)
  const [materialFileLabel, setMaterialFileLabel] = useState<string>("Lecture note")
  const [loadingTopics, setLoadingTopics] = useState(false)
  const [phase, setPhase] = useState<"topics" | "chat">("topics")

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Keep the newest message visible ABOVE the pinned composer (and the bottom menu)
  useEffect(() => {
    const el = bottomRef.current
    if (!el) return
    const composerH = composerRef.current?.offsetHeight ?? 120
    el.style.scrollMarginBottom = `${composerH + 16}px`
    el.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, loading])

  // Phones have no Shift+Enter, so on touch screens Enter makes a new line and the Send button sends
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(pointer: coarse)")
    const update = () => setIsTouch(mq.matches)
    update()
    mq.addEventListener?.("change", update)
    return () => mq.removeEventListener?.("change", update)
  }, [])

  // Detect the on-screen keyboard so the composer is never hidden behind it
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let maxH = vv.height
    let lastW = vv.width
    const onResize = () => {
      if (vv.width !== lastW) {
        // rotation or pinch-zoom: start measuring again
        lastW = vv.width
        maxH = vv.height
      }
      maxH = Math.max(maxH, vv.height)
      const open = maxH - vv.height > 150
      setKeyboardOpen(open)
      if (open && document.activeElement === textareaRef.current) {
        textareaRef.current?.scrollIntoView({ block: "nearest" })
      }
    }
    onResize()
    vv.addEventListener("resize", onResize)
    return () => vv.removeEventListener("resize", onResize)
  }, [])

  // Auto-resize the composer; after the max height it scrolls inside
  const resizeComposer = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    const full = el.scrollHeight
    el.style.height = `${Math.min(full, COMPOSER_MAX_PX)}px`
    el.style.overflowY = full > COMPOSER_MAX_PX ? "auto" : "hidden"
  }, [])

  useEffect(() => {
    resizeComposer()
  }, [input, phase, resizeComposer])

  // Load material + topics when materialId is present
  useEffect(() => {
    if (!materialId) {
      setPhase("chat")
      return
    }

    const load = async () => {
      setLoadingTopics(true)

      // Get the student's first name for the greeting
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: me } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single()
        setStudentName(me?.full_name?.split(" ")[0] ?? "")
      }

      const { data } = await supabase
        .from("materials")
        .select("title, content_text, topics")
        .eq("id", materialId)
        .single()

      const title = data?.title || "Lecture notes"
      setMaterialTitle(title)

      const notes: string = data?.content_text || ""
      setContext(notes)

      // Use the topics the AI saved when it read the PDF
      const saved: string[] = Array.isArray(data?.topics) ? data.topics.map(String) : []

      if (saved.length > 0) {
        setTopics(saved)
      } else {
        // Backup: ask the AI for topics now
        try {
          const res = await fetch("/api/tutor/topics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ materialTitle: title, context: notes }),
          })
          const json = await res.json()
          setTopics(Array.isArray(json.topics) ? json.topics : [])
        } catch {
          setTopics([])
        }
      }
      setLoadingTopics(false)
      setPhase("topics")
    }

    load()
  }, [materialId])

  // keepPending: a side question (hint, recap, follow-up) must not make an unanswered check disappear
  const applyTutorData = (data: Record<string, unknown>, keepPending = false) => {
    if (typeof data.sessionId === "string" && data.sessionId) setSessionId(data.sessionId)
    const replyText = String(data.reply || "")
    if (looksLikeJson(replyText)) {
      throw new Error(
        "I had trouble with that reply. Please try again — your notes are still here."
      )
    }
    const check =
      extractCheck(data as Parameters<typeof extractCheck>[0]) ?? (keepPending ? pendingCheck : null)
    setPendingCheck(check)
    const st = stageFrom(data as { state?: { currentStage?: string } | null })
    if (st) setLessonStage(st)
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role === "assistant") {
        return [
          ...prev.slice(0, -1),
          {
            role: "assistant",
            content: replyText || "No reply.",
            createdAt: last.createdAt || Date.now(),
            check,
            evaluation: (data.evaluation as Message["evaluation"]) || null,
          },
        ]
      }
      return [
        ...prev,
        {
          role: "assistant",
          content: replyText || "No reply.",
          createdAt: Date.now(),
          check,
          evaluation: (data.evaluation as Message["evaluation"]) || null,
        },
      ]
    })
  }

  const startTopic = async (topic: string) => {
    setActiveTopic(topic)
    setPhase("chat")
    setMessages([])
    setSessionId(null)
    setPendingCheck(null)
    setLessonStage(null)
    setSendError(null)
    setLoading(true)
    setThinkingMode("start_lesson")

    try {
      if (materialId) {
        const { data: saved } = await supabase
          .from("tutor_messages")
          .select("role, content, created_at")
          .eq("material_id", materialId)
          .eq("topic", topic)
          .order("created_at", { ascending: false })
          .limit(60)

        if (saved && saved.length > 0) {
          // newest 60 messages, shown oldest first
          const ordered = [...saved].reverse()
          setMessages(
            ordered.map((m) => {
              const content =
                m.role === "assistant" && looksLikeJson(m.content)
                  ? "Previous reply could not be shown. Ask me to continue from here."
                  : m.content
              return {
                role: m.role as "user" | "assistant",
                content,
                createdAt: m.created_at ? new Date(m.created_at as string).getTime() : Date.now(),
              }
            })
          )
          const { data: sess } = await supabase
            .from("tutor_sessions")
            .select("id, current_stage, last_question, preferred_level")
            .eq("material_id", materialId)
            .eq("topic", topic)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle()
          if (sess?.id) {
            setSessionId(sess.id)
            if (sess.current_stage) setLessonStage(String(sess.current_stage))
            const savedLevel = String(sess.preferred_level || "") as LessonLevel
            if (LESSON_LEVELS.includes(savedLevel)) setLevel(savedLevel)

            // Bring back the question the student had not answered yet
            const restored = restoreCheck(sess.last_question)
            const lastSaved = ordered[ordered.length - 1]
            if (restored && lastSaved?.role === "assistant") {
              setPendingCheck(restored)
              setMessages((prev) => {
                const last = prev[prev.length - 1]
                if (!last || last.role !== "assistant") return prev
                return [...prev.slice(0, -1), { ...last, check: restored }]
              })
            }
          }
          setLoading(false)
          return
        }
      }

      setMessages([{ role: "assistant", content: "…", createdAt: Date.now() }])
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_lesson",
          stream: true,
          message: `Teach me this topic thoroughly: "${topic}". Cover the key ideas (what it is, why it matters, how it works), give a clear worked example if there is any calculation, procedure, or code, then check my understanding once.`,
          level,
          context,
          studentName,
          firstMessage: true,
          materialId,
          topic,
        }),
      })
      const { ok, data } = await readTutorResponse(res, (full) => {
        setMessages([{ role: "assistant", content: full }])
      })
      if (!ok || !data.reply) {
        throw new Error(String(data.error || "No reply from the AI."))
      }
      applyTutorData(data)
    } catch (err) {
      setMessages([
        {
          role: "assistant",
          content:
            (err instanceof Error && err.message) || "Could not start this topic. Please try again.",
          createdAt: Date.now(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const leaveToTopics = () => {
    // Navigation only — do NOT mark the topic complete
    setActiveTopic(null)
    setMessages([])
    setSessionId(null)
    setPendingCheck(null)
    setLessonStage(null)
    setOutlineOpen(false)
    setInput("")
    setSendError(null)
    setPhase("topics")
  }

  const markTopicDone = () => {
    if (activeTopic && materialId) {
      setCompletedTopics((prev) => {
        const next = new Set(prev).add(activeTopic)
        saveDoneTopics(materialId, next)
        return next
      })
    }
    leaveToTopics()
  }

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim()
    if (!text || loading) return

    // A typed answer to an open "type your answer" question is checked as an answer
    if (preset === undefined && pendingCheck?.answerType === "short_text" && !checkBusy) {
      if (text.length <= MAX_MESSAGE_CHARS) {
        setInput("")
        void submitCheckAnswer(pendingCheck.questionId, text, true)
        return
      }
    }

    if (text.length > MAX_MESSAGE_CHARS) {
      setSendError(`That message is too long (max ${MAX_MESSAGE_CHARS} characters). Please shorten it.`)
      return
    }

    setSendError(null)
    setInput("")
    setMessages((prev) => [...prev, { role: "user", content: text, createdAt: Date.now() }])
    setLoading(true)
    setThinkingMode("student_message")

    try {
      setMessages((prev) => [...prev, { role: "assistant", content: "…", createdAt: Date.now() }])
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "student_message",
          stream: true,
          sessionId,
          message: text,
          level,
          context,
          studentName,
          history: messages.slice(-6),
          materialId,
          topic: activeTopic || "general",
        }),
      })
      const { ok, data } = await readTutorResponse(res, (full) => {
        setMessages((prev) => {
          const copy = [...prev]
          const last = copy.length - 1
          if (last >= 0 && copy[last].role === "assistant") {
            copy[last] = { ...copy[last], content: full }
          }
          return copy
        })
      })
      if (!ok) throw new Error(String(data.error || "Failed"))
      applyTutorData(data, true)
    } catch (err) {
      // Put the student's text back in the box (even if they started typing something else)
      setInput((prev) => (prev.trim() ? `${text}\n${prev}` : text))
      setMessages((prev) => rollbackTurn(prev, text))
      setSendError(
        (err instanceof Error && err.message) || "Could not send. Your message is still in the box."
      )
    } finally {
      setLoading(false)
    }
  }

  const sendAction = async (
    action: "student_message" | "request_hint" | "request_reexplanation" | "recap",
    text: string
  ) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setSendError(null)
    setMessages((prev) => [...prev, { role: "user", content: trimmed, createdAt: Date.now() }])
    setLoading(true)
    setThinkingMode(action)
    try {
      setMessages((prev) => [...prev, { role: "assistant", content: "…", createdAt: Date.now() }])
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          stream: true,
          sessionId,
          message: trimmed,
          level,
          context,
          studentName,
          history: messages.slice(-6),
          materialId,
          topic: activeTopic || "general",
        }),
      })
      const { ok, data } = await readTutorResponse(res, (full) => {
        setMessages((prev) => {
          const copy = [...prev]
          const last = copy.length - 1
          if (last >= 0 && copy[last].role === "assistant") {
            copy[last] = { ...copy[last], content: full }
          }
          return copy
        })
      })
      if (!ok) throw new Error(String(data.error || "Failed"))
      applyTutorData(data, true)
    } catch (err) {
      setMessages((prev) => rollbackTurn(prev, trimmed))
      setSendError((err instanceof Error && err.message) || "Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const submitCheckAnswer = async (questionId: string, text: string, fromComposer = false) => {
    if (!text.trim() || checkBusy || loading) return
    setCheckBusy(true)
    setSendError(null)
    const answerLine = `ANS: ${text.trim()}`
    const checkSnapshot = messages[messages.length - 1]?.check ?? pendingCheck
    setMessages((prev) => {
      const next = prev.map((m, idx) =>
        idx === prev.length - 1 && m.check
          ? { ...m, checkLocked: true, selectedAnswer: text.trim() }
          : m
      )
      return [...next, { role: "user" as const, content: answerLine, createdAt: Date.now() }]
    })
    setPendingCheck(null)
    setLoading(true)
    setThinkingMode("submit_answer")
    try {
      setMessages((prev) => [...prev, { role: "assistant", content: "…", createdAt: Date.now() }])
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_answer",
          stream: true,
          sessionId,
          message: text.trim(),
          answer: { questionId, text: text.trim() },
          level,
          context,
          studentName,
          history: messages.slice(-6),
          materialId,
          topic: activeTopic || "general",
        }),
      })
      const { ok, data } = await readTutorResponse(res, (full) => {
        setMessages((prev) => {
          const copy = [...prev]
          const last = copy.length - 1
          if (last >= 0 && copy[last].role === "assistant") {
            copy[last] = { ...copy[last], content: full }
          }
          return copy
        })
      })
      if (!ok) throw new Error(String(data.error || "Failed"))
      applyTutorData(data)
    } catch (err) {
      // Give the question back so the student can answer again
      setMessages((prev) =>
        rollbackTurn(prev, answerLine).map((m, idx, arr) =>
          idx === arr.length - 1 && m.check
            ? { ...m, checkLocked: false, selectedAnswer: undefined }
            : m
        )
      )
      setPendingCheck(checkSnapshot)
      // A typed answer goes back into the box so nothing is lost
      if (fromComposer) setInput((prev) => (prev.trim() ? `${text.trim()}\n${prev}` : text.trim()))
      setSendError(
        (err instanceof Error && err.message) || "Could not check that answer. Please try again."
      )
    } finally {
      setLoading(false)
      setCheckBusy(false)
    }
  }

  // No material selected: show the course folders
  if (!materialId) {
    return <CourseFolders />
  }

  // Topics selection phase
  if (phase === "topics") {
    return (
      <div className="min-h-screen pb-24">
        <div className="max-w-lg mx-auto px-5 pt-6">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-muted">
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <p className="font-semibold truncate">{materialTitle || "Material"}</p>
              <p className="text-xs text-gray-500">Choose a topic to study</p>
            </div>
          </div>

          <div className="mb-6">
            <LevelChips level={level} onChange={setLevel} />
          </div>

          {loadingTopics ? (
            <TopicListSkeleton />
          ) : topics.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <p className="text-gray-500 text-sm">Could not extract topics.</p>
              <Button onClick={() => startTopic(materialTitle || "General overview")}>
                Study this material
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {topics.map((topic) => {
                const done = completedTopics.has(topic)
                return (
                  <button
                    key={topic}
                    onClick={() => startTopic(topic)}
                    className={cn(
                      "w-full text-left px-4 py-3.5 rounded-xl border flex items-center gap-3 transition-colors",
                      done
                        ? "border-green-200 bg-green-50"
                        : "border-border bg-card hover:border-primary/40"
                    )}
                  >
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                        done ? "bg-success text-white" : "bg-muted"
                      )}
                    >
                      {done ? <Check size={14} /> : null}
                    </div>
                    <span className={cn("text-sm font-medium", done && "text-gray-500")}>
                      {topic}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <BottomNav />
      </div>
    )
  }

  // Chat phase for a topic — Phase 4 lesson shell
  const completedCount = completedTopics.size
  const totalTopics = Math.max(topics.length, 1)
  const progressCurrent = activeTopic && completedTopics.has(activeTopic)
    ? Math.min(completedCount, totalTopics)
    : Math.min(completedCount, totalTopics)

  return (
    <div className="min-h-screen pb-24 flex flex-col bg-background">
      {isTouch && keyboardOpen && (
        <style>{`[data-app-nav]{display:none !important}`}</style>
      )}
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={leaveToTopics}
            className="p-2 -ml-1 rounded-full hover:bg-muted"
            aria-label="Back to topics"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-500 truncate">AI Tutor · {materialFileLabel}</p>
            <p className="font-semibold text-sm truncate">{activeTopic}</p>
          </div>
          <span className="hidden sm:inline-flex text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-primary/10 text-primary">
            Interactive lesson
          </span>
          <div className="lg:hidden">
            <OutlineToggleButton open={outlineOpen} onClick={() => setOutlineOpen((v) => !v)} />
          </div>
        </div>
      </header>

      <SectionsOverlay
        open={outlineOpen}
        onClose={() => setOutlineOpen(false)}
        materialLabel={materialFileLabel}
        level={level}
        onLevelChange={setLevel}
        progressCurrent={progressCurrent}
        progressTotal={totalTopics}
        stageLabel={prettyStage(lessonStage)}
        topics={topics}
        activeTopic={activeTopic}
        completedTopics={completedTopics}
        disabled={loading}
        onSelectTopic={(t) => void startTopic(t)}
      />

      <div className="max-w-5xl mx-auto w-full flex-1 flex gap-0 lg:gap-6 px-0 lg:px-4">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-border bg-card/50 px-4 py-5 sticky top-14 h-[calc(100vh-3.5rem-5rem)] overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Your lesson</p>
          <div className="rounded-2xl border border-border bg-card p-3 mb-4 space-y-2">
            <p className="text-[11px] text-gray-500">Material</p>
            <p className="text-sm font-medium leading-snug">{materialFileLabel}</p>
          </div>
          <p className="text-[11px] text-gray-500 mb-2">Teaching level</p>
          <div className="mb-4">
            <LevelChips level={level} onChange={setLevel} disabled={loading} />
          </div>
          <div className="mb-4">
            <LessonProgressBar
              current={progressCurrent}
              total={totalTopics}
              stageLabel={prettyStage(lessonStage)}
            />
          </div>
          <p className="text-[11px] text-gray-500 mb-2">Lesson outline</p>
          <TopicOutline
            topics={topics}
            active={activeTopic}
            completed={completedTopics}
            disabled={loading}
            onSelect={(t) => void startTopic(t)}
          />
        </aside>

        {/* Teaching canvas */}
        <main className="flex-1 min-w-0 flex flex-col px-4 pt-4 pb-3">
          <div className="mb-3 lg:hidden">
            <LevelChips level={level} onChange={setLevel} disabled={loading} />
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto pb-4 min-h-[220px]">
            {messages.length === 0 && !loading && (
              <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-gray-500">
                Starting your lesson…
              </div>
            )}
            {messages.map((m, i) => {
              const prev = i > 0 ? messages[i - 1] : null
              const day = m.createdAt ? formatDayLabel(m.createdAt) : ""
              const prevDay = prev?.createdAt ? formatDayLabel(prev.createdAt) : ""
              const showDay = Boolean(day && day !== prevDay)
              return (
              <div key={i} className="space-y-2">
                {showDay ? <DaySeparator label={day} /> : null}
                {m.role === "assistant" && m.evaluation && (
                  <EvaluationCard evaluation={m.evaluation} />
                )}
                <TutorBubble role={m.role} content={m.content} at={m.createdAt} />
                {m.role === "assistant" &&
                  m.check &&
                  (m.checkLocked || (i === messages.length - 1 && pendingCheck)) && (
                    <UnderstandingCheckCard
                      check={m.check}
                      disabled={checkBusy || loading}
                      locked={Boolean(m.checkLocked)}
                      selectedText={m.selectedAnswer}
                      onAnswer={(qid, text) => void submitCheckAnswer(qid, text)}
                    />
                  )}
              </div>
            )})}
            {loading && <TutorThinking mode={thinkingMode} />}
            <div ref={bottomRef} />
          </div>

          {/* Pinned bottom area: quick actions + composer (stays above the keyboard and the bottom menu) */}
          <div
            ref={composerRef}
            className="sticky z-10 -mx-4 px-4 pt-2 pb-2 bg-background/95 backdrop-blur border-t border-border/60 bottom-[var(--composer-bottom)] [--composer-bottom:calc(4rem+env(safe-area-inset-bottom,0px))] lg:[--composer-bottom:0px]"
            style={isTouch && keyboardOpen ? { bottom: 0 } : undefined}
          >
            {/* Quick actions (hidden while typing on a phone to save space) */}
            {!loading && messages.length > 0 && !(isTouch && keyboardOpen) && (
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {(
                  [
                    { label: "Explain simpler", action: "request_reexplanation" as const, text: "Explain this more simply with a different example" },
                    { label: "Hint", action: "request_hint" as const, text: "Give me a hint — not the full answer" },
                    { label: "Recap", action: "recap" as const, text: "Recap the key points so far" },
                    { label: "Worked example", action: "student_message" as const, text: "Work through a calculation or procedure step by step with an example" },
                  ] as const
                ).map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    disabled={loading}
                    onClick={() => void sendAction(chip.action, chip.text)}
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-foreground border border-border hover:border-primary/40"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {sendError && (
              <div
                role="alert"
                className="mb-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              >
                <span className="flex-1 leading-relaxed">{sendError}</span>
                <button
                  type="button"
                  onClick={() => setSendError(null)}
                  className="shrink-0 font-semibold"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Composer */}
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                rows={1}
                maxLength={MAX_MESSAGE_CHARS}
                onChange={(e) => {
                  setInput(e.target.value)
                  if (sendError) setSendError(null)
                }}
                onKeyDown={(e) => {
                  // Computer: Enter sends, Shift+Enter = new line.
                  // Phone/tablet: Enter always = new line; the Send button sends.
                  if (e.key !== "Enter" || e.shiftKey || isTouch) return
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  e.preventDefault()
                  void send()
                }}
                onFocus={() => {
                  window.setTimeout(
                    () => textareaRef.current?.scrollIntoView({ block: "nearest" }),
                    300
                  )
                }}
                enterKeyHint={isTouch ? "enter" : "send"}
                autoCapitalize="sentences"
                placeholder="Ask a question or type an answer…"
                className="flex-1 min-h-12 resize-none rounded-xl border border-border bg-card px-4 py-3 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed"
                aria-label="Message the tutor"
              />
              <Button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keeps the keyboard open when tapping Send
                onClick={() => void send()}
                disabled={loading || !input.trim()}
                className="h-12 w-12 rounded-xl p-0 shrink-0"
                aria-label="Send"
              >
                <Send size={18} />
              </Button>
            </div>
            {input.length > MAX_MESSAGE_CHARS - 500 && (
              <p className="mt-1 text-right text-[11px] text-gray-500">
                {input.length}/{MAX_MESSAGE_CHARS}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={markTopicDone}
            className="mt-3 text-center text-sm text-primary font-medium"
          >
            Done with this topic →
          </button>
        </main>
      </div>
      <BottomNav />
    </div>
  )
}

export default function TutorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen pb-24 px-5 pt-10 max-w-lg mx-auto space-y-4">
          <div className="h-8 w-40 rounded-xl bg-muted animate-pulse" />
          <div className="h-4 w-64 rounded-lg bg-muted animate-pulse" />
          <div className="h-16 w-full rounded-2xl bg-muted animate-pulse" />
          <div className="h-16 w-full rounded-2xl bg-muted animate-pulse" />
          <div className="h-16 w-full rounded-2xl bg-muted animate-pulse" />
        </div>
      }
    >
      <TutorContent />
    </Suspense>
  )
}
