// PATH: src/app/(dashboard)/tutor/page.tsx
"use client"

import { useState, useRef, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { BottomNav } from "@/components/bottom-nav"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Send, Loader2, ArrowLeft, Check, Folder, FolderOpen, ChevronDown, FileText } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Markdown } from "@/components/markdown"
import { HeadphonesButton } from "@/components/music/headphones-button"

type Message = {
  role: "user" | "assistant"
  content: string
}

type FolderCourse = { id: string; code: string; title: string | null }
type FolderNote = { id: string; title: string; course_id: string }

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

function TutorContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const materialId = searchParams.get("material")

  const [level, setLevel] = useState<"primary" | "normal" | "exam">("primary")
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [materialTitle, setMaterialTitle] = useState<string | null>(null)
  const [context, setContext] = useState("") // the AI's notes about this material
  const [studentName, setStudentName] = useState("") // first name, used in the greeting
  const [topics, setTopics] = useState<string[]>([])
  const [completedTopics, setCompletedTopics] = useState<Set<string>>(new Set())
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
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
          message: `Teach me this topic thoroughly: "${topic}". Material: ${materialTitle || "lecture notes"}. Cover the key ideas from my notes, give a clear worked example if there is any calculation or procedure, then give me 2 practice questions to try (do not reveal full answers yet).`,
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
      setMessages([{ role: "assistant", content: data.reply }])
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
    if (activeTopic) {
      setCompletedTopics((prev) => new Set(prev).add(activeTopic))
    }
    setActiveTopic(null)
    setMessages([])
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
          message: activeTopic ? `[Topic: ${activeTopic}] ${text}` : text,
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
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || "No reply." },
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

          <div className="flex gap-2 mb-6 flex-wrap">
            {[
              { id: "primary", label: "Primary 2" },
              { id: "normal", label: "Normal" },
              { id: "exam", label: "Exam-ready" },
            ].map((l) => (
              <button
                key={l.id}
                onClick={() => setLevel(l.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  level === l.id ? "bg-primary text-white" : "bg-muted text-gray-600"
                )}
              >
                {l.label}
              </button>
            ))}
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

  // Chat phase for a topic
  return (
    <div className="min-h-screen pb-24 flex flex-col">
      <div className="max-w-lg mx-auto w-full px-5 pt-6 flex-1 flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={markTopicDone}
            className="p-2 -ml-2 rounded-full hover:bg-muted"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{activeTopic}</p>
            <p className="text-xs text-gray-500 truncate">{materialTitle}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            { id: "primary", label: "Primary 2" },
            { id: "normal", label: "Normal" },
            { id: "exam", label: "Exam-ready" },
          ].map((l) => (
            <button
              key={l.id}
              onClick={() => setLevel(l.id as any)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                level === l.id ? "bg-primary text-white" : "bg-muted text-gray-600"
              )}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pb-4 min-h-[200px]">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                m.role === "user"
                  ? "ml-auto bg-primary text-white whitespace-pre-wrap"
                  : "bg-card border border-border"
              )}
            >
              {m.role === "user" ? m.content : <Markdown text={m.content} />}
            </div>
          ))}
          {loading && (
            <div className="bg-card border border-border rounded-2xl px-4 py-3 w-fit">
              <Loader2 size={18} className="animate-spin text-primary" />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {!loading && messages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {[
              "Give me 2 practice questions from my notes (hide answers until I try)",
              "Work through a calculation or procedure step by step with an example",
              "What do examiners usually ask on this topic?",
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={loading}
                onClick={() => {
                  void send(chip)
                }}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-foreground border border-border hover:border-primary/40"
              >
                {chip.includes("practice")
                  ? "Practice questions"
                  : chip.includes("calculation")
                    ? "Worked example"
                    : "Exam tips"}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Ask a follow-up question"
            disabled={loading}
            className="flex-1 h-12 rounded-xl border border-border px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
          <Button onClick={() => void send()} disabled={loading || !input.trim()} className="h-12 w-12 rounded-xl p-0">
            <Send size={18} />
          </Button>
        </div>

        <button
          onClick={markTopicDone}
          className="mt-3 text-center text-sm text-primary font-medium"
        >
          Done with this topic →
        </button>
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
