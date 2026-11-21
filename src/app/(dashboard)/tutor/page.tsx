// PATH: src/app/(dashboard)/tutor/page.tsx
"use client"

import { useState, useRef, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { BottomNav } from "@/components/bottom-nav"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Send, Loader2, ArrowLeft, Check, Folder, FolderOpen, ChevronDown, FileText, X } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { HeadphonesButton } from "@/components/music/headphones-button"
import {
  EvaluationCard,
  UnderstandingCheckCard,
  TutorBubble,
  TutorTyping,
} from "@/components/tutor/lesson-blocks"
import {
  LevelChips,
  LessonProgressBar,
  TopicOutline,
  OutlineToggleButton,
  type LessonLevel,
} from "@/components/tutor/lesson-sidebar"

type Message = {
  role: "user" | "assistant"
  content: string
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
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
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

function stageFrom(data: { state?: { currentStage?: string } | null }): string | null {
  const s = data?.state?.currentStage
  return typeof s === "string" && s ? s : null
}

function prettyStage(stage: string | null): string | undefined {
  if (!stage) return undefined
  return stage.replace(/_/g, " ")
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
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [lessonStage, setLessonStage] = useState<string | null>(null)
  const [materialFileLabel, setMaterialFileLabel] = useState<string>("Lecture note")
  const [loadingTopics, setLoadingTopics] = useState(false)
  const [phase, setPhase] = useState<"topics" | "chat">("topics")

  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

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

  const startTopic = async (topic: string) => {
    setActiveTopic(topic)
    setPhase("chat")
    setMessages([])
    setLoading(true)

    try {
      // Load previous chat for this material + topic (if any)
      if (materialId) {
        const { data: saved } = await supabase
          .from("tutor_messages")
          .select("role, content")
          .eq("material_id", materialId)
          .eq("topic", topic)
          .order("created_at", { ascending: true })
          .limit(40)

        if (saved && saved.length > 0) {
          setMessages(
            saved.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
          )
          setLoading(false)
          return
        }
      }

      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_lesson",
          message: `Teach me this topic thoroughly: "${topic}". Cover the key ideas (what it is, why it matters, how it works), give a clear worked example if there is any calculation, procedure, or code, then check my understanding once.`,
          level,
          context,
          studentName,
          firstMessage: true,
          materialId,
          topic,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.reply) {
        throw new Error(data.error || "No reply from the AI.")
      }
      if (data.sessionId) setSessionId(data.sessionId)
      const check = extractCheck(data)
      setPendingCheck(check)
      {
        const st = stageFrom(data)
        if (st) setLessonStage(st)
      }
      setMessages([
        {
          role: "assistant",
          content: data.reply,
          check,
        },
      ])
    } catch (err) {
      setMessages([
        {
          role: "assistant",
          content:
            (err instanceof Error && err.message) || "Could not start this topic. Please try again.",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const markTopicDone = () => {
    if (activeTopic && materialId) {
      setCompletedTopics((prev) => {
        const next = new Set(prev).add(activeTopic)
        saveDoneTopics(materialId, next)
        return next
      })
    }
    setActiveTopic(null)
    setMessages([])
    setSessionId(null)
    setPendingCheck(null)
    setLessonStage(null)
    setOutlineOpen(false)
    setPhase("topics")
  }

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim()
    if (!text || loading) return

    setInput("")
    setMessages((prev) => [...prev, { role: "user", content: text }])
    setLoading(true)

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "student_message",
          sessionId,
          message: activeTopic ? text : text,
          level,
          context,
          studentName,
          history: messages.slice(-8),
          materialId,
          topic: activeTopic || "general",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      if (data.sessionId) setSessionId(data.sessionId)
      const check = extractCheck(data)
      setPendingCheck(check)
      {
        const st = stageFrom(data)
        if (st) setLessonStage(st)
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "No reply.",
          check,
          evaluation: data.evaluation || null,
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            (err instanceof Error && err.message) || "Something went wrong. Please try again.",
        },
      ])
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
    setInput("")
    setMessages((prev) => [...prev, { role: "user", content: trimmed }])
    setLoading(true)
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          sessionId,
          message: trimmed,
          level,
          context,
          studentName,
          history: messages.slice(-8),
          materialId,
          topic: activeTopic || "general",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      if (data.sessionId) setSessionId(data.sessionId)
      const check = extractCheck(data)
      setPendingCheck(check)
      {
        const st = stageFrom(data)
        if (st) setLessonStage(st)
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "No reply.",
          check,
          evaluation: data.evaluation || null,
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            (err instanceof Error && err.message) || "Something went wrong. Please try again.",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const submitCheckAnswer = async (questionId: string, text: string) => {
    if (!text.trim() || checkBusy || loading) return
    setCheckBusy(true)
    setMessages((prev) => [...prev, { role: "user", content: text.trim() }])
    setPendingCheck(null)
    setLoading(true)
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_answer",
          sessionId,
          message: text.trim(),
          answer: { questionId, text: text.trim() },
          level,
          context,
          studentName,
          history: messages.slice(-8),
          materialId,
          topic: activeTopic || "general",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      if (data.sessionId) setSessionId(data.sessionId)
      const check = extractCheck(data)
      setPendingCheck(check)
      {
        const st = stageFrom(data)
        if (st) setLessonStage(st)
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || data.evaluation?.feedback || "No reply.",
          check,
          evaluation: data.evaluation || null,
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            (err instanceof Error && err.message) || "Could not check that answer. Try again.",
        },
      ])
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
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-primary" size={28} />
            </div>
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
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={markTopicDone}
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

      {/* Mobile outline sheet */}
      {outlineOpen && (
        <div className="lg:hidden border-b border-border bg-card px-4 py-4 space-y-4 max-h-[50vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Your lesson</p>
            <button type="button" className="p-1.5 rounded-lg hover:bg-muted" onClick={() => setOutlineOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="text-xs text-gray-500 space-y-1">
            <p>
              <span className="font-medium text-foreground">Material: </span>
              {materialFileLabel}
            </p>
          </div>
          <LevelChips level={level} onChange={setLevel} disabled={loading} />
          <LessonProgressBar
            current={progressCurrent}
            total={totalTopics}
            stageLabel={prettyStage(lessonStage)}
          />
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Lesson outline</p>
            <TopicOutline
              topics={topics}
              active={activeTopic}
              completed={completedTopics}
              disabled={loading}
              onSelect={(t) => {
                setOutlineOpen(false)
                void startTopic(t)
              }}
            />
          </div>
        </div>
      )}

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
            {messages.map((m, i) => (
              <div key={i} className="space-y-2">
                <TutorBubble role={m.role} content={m.content} />
                {m.role === "assistant" && m.evaluation && (
                  <EvaluationCard evaluation={m.evaluation} />
                )}
                {m.role === "assistant" &&
                  m.check &&
                  i === messages.length - 1 &&
                  pendingCheck && (
                    <UnderstandingCheckCard
                      check={m.check}
                      disabled={checkBusy || loading}
                      onAnswer={(qid, text) => void submitCheckAnswer(qid, text)}
                    />
                  )}
              </div>
            ))}
            {loading && <TutorTyping />}
            <div ref={bottomRef} />
          </div>

          {/* Quick actions */}
          {!loading && messages.length > 0 && (
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

          {/* Composer */}
          <div className="flex gap-2 pt-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
              placeholder="Ask a question or type an answer…"
              disabled={loading}
              className="flex-1 h-12 rounded-xl border border-border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              aria-label="Message the tutor"
            />
            <Button
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              className="h-12 w-12 rounded-xl p-0"
              aria-label="Send"
            >
              <Send size={18} />
            </Button>
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
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      }
    >
      <TutorContent />
    </Suspense>
  )
}
