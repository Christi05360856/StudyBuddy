// PATH: src/app/(dashboard)/courses/[id]/page.tsx
"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { BottomNav } from "@/components/bottom-nav"
import {
  ArrowLeft,
  Upload,
  FileText,
  CheckCircle2,
  Loader2,
  AlertCircle,
  BookOpen,
  RefreshCw,
  Trash2,
  Layers,
  Calendar,
  Share2,
} from "lucide-react"
import { toTitleCase, isValidTitle } from "@/lib/course-code"
import { makeContentKey, type SharedMaterialRow } from "@/lib/share"
import { HeadphonesButton } from "@/components/music/headphones-button"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { uploadToStorage } from "@/lib/upload"
import { ACCEPT_ATTRIBUTE, FILE_TYPES, getExtension, stripExtension } from "@/lib/file-types"

type MaterialStatus = "uploading" | "processing" | "ready" | "failed"

interface Material {
  id: string
  title: string
  page_count: number | null
  status: MaterialStatus
  file_path: string
  created_at: string
  topics: string[] | null
  // What the AI is doing right now (set by the server while it works)
  stage?: string | null
  progress?: number | null
  // How many questions this note really has (counted by the database)
  questions: { count: number }[] | null
}

interface Course {
  id: string
  code: string
  title: string | null
  assessment_date: string | null
  assessment_type: string | null
}

const LECTURE_OPTIONS = [
  "Lecture 1",
  "Lecture 2",
  "Lecture 3",
  "Lecture 4",
  "Lecture 5",
  "Semester material",
  "Past questions",
  "Other",
]

// Biggest file a student can upload. Change this one number to change the limit.
const MAX_FILE_MB = 12
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

// Turns a size in bytes into text like "850 KB" or "4.2 MB"
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function CourseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<"notes" | "quizzes">("notes")
  const [course, setCourse] = useState<Course | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])

  // "loading" is only for the very first time the page opens.
  // Later refreshes happen quietly in the background.
  const [loading, setLoading] = useState(true)

  const [uploading, setUploading] = useState(false)
  const [percent, setPercent] = useState(0)

  // One place for messages shown to the student (upload problems, AI problems, delete problems)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Upload label modal
  const [showLabelModal, setShowLabelModal] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [label, setLabel] = useState("Lecture 1")
  const [customLabel, setCustomLabel] = useState("")

  // Delete confirmation modal
  const [toDelete, setToDelete] = useState<Material | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Title + assessment date editing
  const [editTitle, setEditTitle] = useState("")
  const [editDate, setEditDate] = useState("")
  const [editType, setEditType] = useState("Test")
  const [savingMeta, setSavingMeta] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [showMeta, setShowMeta] = useState(false)

  // Department share
  const [profileInst, setProfileInst] = useState("")
  const [profileDept, setProfileDept] = useState("")
  const [profileName, setProfileName] = useState("")
  const [deptShared, setDeptShared] = useState<SharedMaterialRow[]>([])
  const [addedSharedIds, setAddedSharedIds] = useState<Set<string>>(new Set())
  const [mySharedMaterialIds, setMySharedMaterialIds] = useState<Set<string>>(new Set())
  const [shareTarget, setShareTarget] = useState<Material | null>(null)
  const [shareChecked, setShareChecked] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [blockedShare, setBlockedShare] = useState<SharedMaterialRow | null>(null)

  const supabase = createClient()

  // Gets the course and its notes from the database.
  // NOTE: this function does NOT turn the big loading screen on.
  // That was the cause of the flashing: it ran every 4 seconds while the AI was reading.
  const load = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: courseData } = await supabase
      .from("courses")
      .select("id, code, title, assessment_date, assessment_type")
      .eq("id", courseId)
      .eq("user_id", user.id)
      .single()

    if (courseData) {
      setCourse(courseData)
      setEditTitle(courseData.title ?? "")
      setEditDate(courseData.assessment_date ?? "")
      setEditType(courseData.assessment_type ?? "Test")
    }

    const baseColumns = "id, title, page_count, status, file_path, created_at, topics, questions(count)"
    const loadMaterials = (columns: string) =>
      supabase
        .from("materials")
        .select(columns)
        .eq("course_id", courseId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

    // Ask for the progress columns too. If they do not exist yet (supabase-update-2.sql not run),
    // fall back to the old list so the page still works.
    let { data: mats, error: matsError } = await loadMaterials(baseColumns + ", stage, progress")
    if (matsError) ({ data: mats } = await loadMaterials(baseColumns))

    if (mats) setMaterials(mats as unknown as Material[])

    // Profile + department shared notes for this course code
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name, institution, department")
      .eq("id", user.id)
      .single()

    if (prof) {
      setProfileName(prof.full_name || "")
      setProfileInst(prof.institution || "")
      setProfileDept(prof.department || "")
    }

    const codeNorm = courseData
      ? (courseData as { code: string }).code.replace(/\s+/g, "").toUpperCase()
      : ""

    if (prof?.institution && prof?.department && codeNorm) {
      const { data: shared } = await supabase
        .from("shared_materials")
        .select("*")
        .eq("institution", prof.institution)
        .eq("department", prof.department)
        .eq("code_normalized", codeNorm)
        .order("created_at", { ascending: false })

      setDeptShared((shared as SharedMaterialRow[]) || [])

      const { data: added } = await supabase
        .from("added_shared_materials")
        .select("shared_material_id")
        .eq("user_id", user.id)

      setAddedSharedIds(new Set((added || []).map((a: { shared_material_id: string }) => a.shared_material_id)))

      const { data: mine } = await supabase
        .from("shared_materials")
        .select("material_id")
        .eq("user_id", user.id)

      setMySharedMaterialIds(new Set((mine || []).map((r: { material_id: string }) => r.material_id)))
    }

    setLoading(false)
  }

  // First load (and again only if the student opens a different course)
  useEffect(() => {
    if (!courseId) return
    setLoading(true)
    load()
  }, [courseId])

  // While any note is being prepared, quietly check again every 2.5 seconds.
  // We watch a simple true/false value, so the timer is not restarted on every refresh.
  const hasProcessing = materials.some((m) => m.status === "processing")
  useEffect(() => {
    if (!hasProcessing) return
    const interval = setInterval(() => load(), 2500)
    return () => clearInterval(interval)
  }, [hasProcessing])

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErrorMsg(null)

    const ext = getExtension(file.name)
    if (!FILE_TYPES[ext]) {
      setErrorMsg(
        ext === "xls"
          ? "Old Excel (.xls) files are not supported. Open it and choose Save As > Excel Workbook (.xlsx), then upload again."
          : ext === "ppt"
            ? "Old PowerPoint (.ppt) files are not supported. Save it as .pptx or PDF, then upload again."
            : "This file type is not supported. Use PDF, Word, PowerPoint, Excel, a text file or a photo."
      )
    } else if (file.size > MAX_FILE_BYTES) {
      setErrorMsg(
        `That file is ${formatSize(file.size)}. The limit is ${MAX_FILE_MB} MB. Try a smaller file.`
      )
    } else {
      setPendingFile(file)
      setLabel("Lecture 1")
      setCustomLabel("")
      setShowLabelModal(true)
    }

    // Reset the picker so the same file can be chosen again later
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const confirmUpload = async () => {
    if (!pendingFile || !course) return

    const finalTitle =
      label === "Other" && customLabel.trim()
        ? customLabel.trim()
        : label === "Other"
          ? pendingFile.name
          : `${label} – ${stripExtension(pendingFile.name)}`

    // Hard block if this note is already shared in the department (saves AI tokens)
    if (course && profileInst && profileDept) {
      const codeNorm = course.code.replace(/\s+/g, "").toUpperCase()
      const key = makeContentKey({
        codeNormalized: codeNorm,
        materialTitle: finalTitle,
        fileSize: pendingFile.size,
      })
      const { data: existing } = await supabase
        .from("shared_materials")
        .select("*")
        .eq("institution", profileInst)
        .eq("department", profileDept)
        .eq("code_normalized", codeNorm)
        .eq("content_key", key)
        .maybeSingle()

      if (existing) {
        setBlockedShare(existing as SharedMaterialRow)
        setShowLabelModal(false)
        setPendingFile(null)
        return
      }
    }

    setShowLabelModal(false)
    setUploading(true)
    setPercent(0)
    setErrorMsg(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!user || !session) {
      setUploading(false)
      setErrorMsg("Your session has ended. Please log in again.")
      return
    }

    // Kept outside "try" so we can clean up if saving the note fails
    const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const filePath = `${user.id}/${courseId}/${Date.now()}_${safeName}`
    let fileUploaded = false

    try {
      // Upload the file and update the progress bar as it goes
      await uploadToStorage({
        bucket: "materials",
        path: filePath,
        file: pendingFile,
        accessToken: session.access_token,
        onProgress: setPercent,
      })
      fileUploaded = true

      const { data: material, error: insertError } = await supabase
        .from("materials")
        .insert({
          course_id: courseId,
          user_id: user.id,
          title: finalTitle,
          file_path: filePath,
          file_size: pendingFile.size,
          status: "processing",
        })
        .select()
        .single()

      if (insertError) throw insertError

      setPendingFile(null)
      await load()

      // The AI reads the file in the background
      if (material?.id) processMaterial(material.id)
    } catch (err: any) {
      console.error(err)
      // If the file went up but the note was not saved, remove the lonely file
      if (fileUploaded) {
        await supabase.storage.from("materials").remove([filePath])
      }
      setErrorMsg(err.message || "Upload failed. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  // Asks the AI to read the file and write the questions (also used by "Try again")
  const processMaterial = async (id: string) => {
    setErrorMsg(null)
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, status: "processing" } : m)))
    try {
      const res = await fetch("/api/process-material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId: id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErrorMsg(json.error || "We could not prepare this file.")
    } catch {
      setErrorMsg("Could not reach the server. Check your internet and try again.")
    }
    await load()
  }

  // Opens the original file so the student can read it without the AI
  const readMaterial = async (m: Material) => {
    // Open the new tab first, otherwise phones may block it
    const newTab = window.open("", "_blank")
    const { data, error } = await supabase.storage
      .from("materials")
      .createSignedUrl(m.file_path, 60 * 60)

    if (error || !data?.signedUrl) {
      newTab?.close()
      setErrorMsg("Could not open this file. Please try again.")
      return
    }

    if (newTab) newTab.location.href = data.signedUrl
    else window.location.href = data.signedUrl
  }

  // Deletes a note: first the database row (which also removes its questions and quiz history),
  // then the uploaded file itself.
  const deleteMaterial = async () => {
    if (!toDelete) return
    setDeleting(true)
    setErrorMsg(null)

    const { data, error } = await supabase
      .from("materials")
      .delete()
      .eq("id", toDelete.id)
      .select("id")

    if (error || !data || data.length === 0) {
      setErrorMsg("Could not delete this note. Please try again.")
      setDeleting(false)
      setToDelete(null)
      return
    }

    // The note is already gone. If removing the file fails, the student does not need to know.
    await supabase.storage.from("materials").remove([toDelete.file_path])

    setMaterials((prev) => prev.filter((m) => m.id !== toDelete.id))
    setDeleting(false)
    setToDelete(null)
  }


  const saveMeta = async () => {
    if (!course) return
    const cleanTitle = toTitleCase(editTitle)
    if (!isValidTitle(cleanTitle)) {
      setMetaError("Title must be between 3 and 80 characters.")
      return
    }
    setSavingMeta(true)
    setMetaError(null)
    const { error } = await supabase
      .from("courses")
      .update({
        title: cleanTitle,
        assessment_date: editDate || null,
        assessment_type: editDate ? editType : null,
      })
      .eq("id", course.id)
    if (error) {
      setMetaError("Could not save. Please try again.")
      setSavingMeta(false)
      return
    }
    setCourse({
      ...course,
      title: cleanTitle,
      assessment_date: editDate || null,
      assessment_type: editDate ? editType : null,
    })
    setShowMeta(false)
    setSavingMeta(false)
  }

  const shareMaterial = async () => {
    if (!shareTarget || !course || !shareChecked || !profileInst || !profileDept) return
    setSharing(true)
    setShareMsg(null)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setSharing(false)
      return
    }

    const codeNorm = course.code.replace(/\s+/g, "").toUpperCase()
    const key = makeContentKey({
      codeNormalized: codeNorm,
      materialTitle: shareTarget.title,
      fileSize: null,
    })

    // Prefer size from DB if we can
    const { data: matRow } = await supabase
      .from("materials")
      .select("file_size")
      .eq("id", shareTarget.id)
      .single()

    const contentKey = makeContentKey({
      codeNormalized: codeNorm,
      materialTitle: shareTarget.title,
      fileSize: matRow?.file_size ?? null,
    })

    const { error } = await supabase.from("shared_materials").insert({
      material_id: shareTarget.id,
      user_id: user.id,
      institution: profileInst,
      department: profileDept,
      code_normalized: codeNorm,
      course_code: course.code,
      course_title: course.title,
      material_title: shareTarget.title,
      file_size: matRow?.file_size ?? null,
      content_key: contentKey,
      sharer_name: profileName.split(" ")[0] || "A student",
    })

    if (error) {
      if (error.code === "23505") {
        setShareMsg("Already shared for this course in your department.")
      } else {
        setShareMsg(error.message || "Could not share. Try again.")
      }
      setSharing(false)
      return
    }

    setMySharedMaterialIds((prev) => new Set(prev).add(shareTarget.id))
    setShareTarget(null)
    setShareChecked(false)
    setSharing(false)
    await load()
  }

  const addSharedNote = async (row: SharedMaterialRow) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || !course) return

    const { error } = await supabase.from("added_shared_materials").insert({
      user_id: user.id,
      shared_material_id: row.id,
      course_id: course.id,
    })
    if (error && error.code !== "23505") {
      setErrorMsg("Could not add this note. Try again.")
      return
    }
    setAddedSharedIds((prev) => new Set(prev).add(row.id))
    setBlockedShare(null)
  }

  // How many questions a note really has
  const questionCount = (m: Material) => m.questions?.[0]?.count ?? 0

  // Notes that never got questions, or were never read by the AI for topics, need another try.
  // (Old uploads were marked "ready" without either of these.)
  const noQuestions = (m: Material) =>
    m.status === "ready" && (questionCount(m) === 0 || m.topics === null)

  // A material that has been "processing" for over 3 minutes is stuck
  const isStuck = (m: Material) =>
    m.status === "processing" && Date.now() - new Date(m.created_at).getTime() > 3 * 60 * 1000

  // What to tell the student while the AI works
  const stageText = (m: Material) => {
    if (m.stage === "reading") return "Reading your notes..."
    if (m.stage === "writing") return "Writing your questions..."
    if (m.stage === "saving") return "Almost done..."
    return "Preparing your content. This can take a minute..."
  }
  const needsRetry = (m: Material) => m.status === "failed" || isStuck(m) || noQuestions(m)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  if (!course) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5">
        <p className="text-gray-500">Course not found</p>
        <Button onClick={() => router.push("/courses")}>Back to courses</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-5 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="p-2 -ml-2 rounded-full hover:bg-muted"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-500">Course</p>
            <h1 className="text-xl font-bold">{course.code}</h1>
            {course.title ? (
              <p className="text-sm text-gray-500 truncate">{course.title}</p>
            ) : (
              <button
                type="button"
                onClick={() => setShowMeta(true)}
                className="text-sm text-amber-600 font-medium"
              >
                Add a title
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <HeadphonesButton />
            <button
              type="button"
              onClick={() => setShowMeta(true)}
              className="p-2 rounded-full hover:bg-muted text-gray-500"
              aria-label="Edit course details"
            >
              <Calendar size={18} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("notes")}
            className={cn(
              "flex-1 h-10 rounded-xl font-medium text-sm transition-colors",
              tab === "notes" ? "bg-primary text-white" : "bg-muted text-foreground"
            )}
          >
            Notes
          </button>
          <button
            onClick={() => setTab("quizzes")}
            className={cn(
              "flex-1 h-10 rounded-xl font-medium text-sm transition-colors",
              tab === "quizzes" ? "bg-primary text-white" : "bg-muted text-foreground"
            )}
          >
            Quizzes
          </button>
        </div>

        {tab === "notes" && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              className="hidden"
              onChange={onFileChosen}
            />
            {uploading ? (
              <div className="w-full rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium">
                    {percent < 100 ? "Uploading..." : "Finishing..."}
                  </span>
                  <span className="font-semibold text-primary">{percent}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-200"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-dashed border-border text-gray-500 hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <Upload size={18} />
                  <span className="font-medium">Add notes</span>
                </button>
                <p className="text-xs text-gray-400 text-center">
                  PDF, Word, PowerPoint, Excel, text or a clear photo. Up to {MAX_FILE_MB} MB.
                </p>
              </>
            )}

            {errorMsg && (
              <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-lg">{errorMsg}</p>
            )}

            {materials.length === 0 && !uploading && (
              <p className="text-center text-gray-400 text-sm py-8">
                No notes yet. Upload a file to get started.
              </p>
            )}

            {materials.map((m) => (
              <div key={m.id} className="p-4 rounded-2xl bg-card border border-border space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{m.title}</p>
                    <p className="text-sm text-gray-500">
                      {FILE_TYPES[getExtension(m.file_path)] && (
                        <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold uppercase text-gray-500">
                          {getExtension(m.file_path)}
                        </span>
                      )}
                      {m.status === "ready" && !noQuestions(m) ? `${questionCount(m)} questions · ready` : null}
                      {noQuestions(m) && "Not fully prepared yet – try again"}
                      {m.status === "processing" && !isStuck(m) && stageText(m)}
                      {m.status === "processing" && isStuck(m) && "Taking too long – try again"}
                      {m.status === "uploading" && "Uploading..."}
                      {m.status === "failed" && "Could not prepare this file – try again"}
                    </p>
                  </div>
                  {m.status === "ready" && !noQuestions(m) && (
                    <CheckCircle2 size={20} className="text-success shrink-0" />
                  )}
                  {m.status === "processing" && !isStuck(m) && (
                    <Loader2 size={20} className="text-primary animate-spin shrink-0" />
                  )}
                  {needsRetry(m) && <AlertCircle size={20} className="text-danger shrink-0" />}
                </div>

                {m.status === "processing" && !isStuck(m) && typeof m.progress === "number" && m.progress > 0 && (
                  <div
                    className="h-2 rounded-full bg-muted overflow-hidden"
                    role="progressbar"
                    aria-valuenow={m.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${m.progress}%` }} />
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-w-[4.5rem] flex-1 text-xs h-9 gap-1.5"
                    onClick={() => readMaterial(m)}
                  >
                    <BookOpen size={14} />
                    {getExtension(m.file_path) === "pdf" ? "Read" : "Open"}
                  </Button>
                  {m.status === "ready" && !noQuestions(m) && (
                    <Link href={`/tutor?material=${m.id}`} className="min-w-[4.5rem] flex-1">
                      <Button size="sm" className="w-full text-xs h-9 px-2">
                        Tutor
                      </Button>
                    </Link>
                  )}
                  {m.status === "ready" && !noQuestions(m) && (
                    <Link
                      href={`/flashcards?material=${m.id}&course=${courseId}`}
                      className="flex-1"
                    >
                      <Button size="sm" variant="outline" className="w-full text-xs h-9 gap-1">
                        <Layers size={14} />
                        Cards
                      </Button>
                    </Link>
                  )}
                  {m.status === "ready" && !noQuestions(m) && profileDept && (
                    mySharedMaterialIds.has(m.id) ? (
                      <span className="text-[11px] text-success font-medium px-1">Shared</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setShareTarget(m)
                          setShareChecked(false)
                          setShareMsg(null)
                        }}
                        className="h-9 w-9 shrink-0 rounded-xl border border-border text-gray-400 flex items-center justify-center hover:text-primary hover:border-primary/40"
                        aria-label="Share with department"
                      >
                        <Share2 size={16} />
                      </button>
                    )
                  )}
                  {needsRetry(m) && (
                    <Button
                      size="sm"
                      className="flex-1 text-xs h-9 gap-1.5"
                      onClick={() => processMaterial(m.id)}
                    >
                      <RefreshCw size={14} />
                      Try again
                    </Button>
                  )}
                  <button
                    onClick={() => setToDelete(m)}
                    aria-label={`Delete ${m.title}`}
                    className="h-9 w-9 shrink-0 rounded-xl border border-border text-gray-400 flex items-center justify-center hover:text-danger hover:border-danger/40 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}

            {/* Notes already shared in this department for this course */}
            {deptShared.length > 0 && (
              <div className="pt-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">From your department</h3>
                <p className="text-xs text-gray-500">Shared notes for {course?.code}. Add them — no AI cost.</p>
                {deptShared.map((row) => {
                  const added = addedSharedIds.has(row.id)
                  const mine = row.user_id && mySharedMaterialIds.has(row.material_id)
                  return (
                    <div key={row.id} className="p-4 rounded-2xl bg-card border border-border space-y-2">
                      <p className="font-medium truncate">{row.material_title}</p>
                      <p className="text-xs text-gray-500">Shared by {row.sharer_name}</p>
                      <div className="flex gap-2">
                        {added || mine ? (
                          <>
                            <Link href={`/quiz?material=${row.material_id}&type=test`} className="flex-1">
                              <Button size="sm" className="w-full text-xs h-9">Quiz</Button>
                            </Link>
                            <Link href={`/flashcards?material=${row.material_id}&course=${courseId}`} className="flex-1">
                              <Button size="sm" variant="outline" className="w-full text-xs h-9">Cards</Button>
                            </Link>
                          </>
                        ) : (
                          <Button size="sm" className="flex-1 text-xs h-9" onClick={() => addSharedNote(row)}>
                            Add note
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === "quizzes" && (
          <div className="space-y-4">
            {materials.filter((m) => m.status === "ready" && !noQuestions(m)).length === 0 &&
            deptShared.filter((r) => addedSharedIds.has(r.id) || mySharedMaterialIds.has(r.material_id)).length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                No quizzes ready yet. Upload notes first.
              </p>
            ) : (
              <>
                {materials
                  .filter((m) => m.status === "ready" && !noQuestions(m))
                  .map((m) => (
                    <div key={m.id} className="p-4 rounded-2xl bg-card border border-border space-y-3">
                      <p className="font-medium truncate">{m.title}</p>
                      <div className="flex gap-2">
                        <Link href={`/quiz?material=${m.id}&type=test`} className="flex-1">
                          <Button className="w-full" size="sm">Test · {Math.min(30, questionCount(m))}Q</Button>
                        </Link>
                        <Link href={`/quiz?material=${m.id}&type=exam`} className="flex-1">
                          <Button variant="outline" className="w-full" size="sm">Exam · {Math.min(50, questionCount(m))}Q</Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                {deptShared
                  .filter((r) => addedSharedIds.has(r.id) || mySharedMaterialIds.has(r.material_id))
                  .map((r) => (
                    <div key={r.id} className="p-4 rounded-2xl bg-card border border-border space-y-3">
                      <p className="font-medium truncate">{r.material_title}</p>
                      <p className="text-xs text-gray-500">Shared by {r.sharer_name}</p>
                      <div className="flex gap-2">
                        <Link href={`/quiz?material=${r.material_id}&type=test`} className="flex-1">
                          <Button className="w-full" size="sm">Test</Button>
                        </Link>
                        <Link href={`/quiz?material=${r.material_id}&type=exam`} className="flex-1">
                          <Button variant="outline" className="w-full" size="sm">Exam</Button>
                        </Link>
                      </div>
                    </div>
                  ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Label selection modal */}
      {showLabelModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">What is this material?</h2>
            <p className="text-sm text-gray-500 break-words">
              {pendingFile?.name}
              {pendingFile && ` (${formatSize(pendingFile.size)})`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {LECTURE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setLabel(opt)}
                  className={cn(
                    "h-10 rounded-xl text-sm font-medium border transition-colors",
                    label === opt
                      ? "bg-primary text-white border-primary"
                      : "bg-card border-border text-foreground"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
            {label === "Other" && (
              <Input
                placeholder="e.g. Revision notes, Assignment 2"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                autoFocus
              />
            )}
            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setShowLabelModal(false)
                  setPendingFile(null)
                }}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={confirmUpload}>
                Upload
              </Button>
            </div>
          </div>
        </div>
      )}


      {/* Edit title + assessment date */}
      {showMeta && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Course details</h2>
            <div>
              <label className="block text-sm font-medium mb-1">Course title</label>
              <Input
                value={editTitle}
                onChange={(e) => {
                  setEditTitle(e.target.value)
                  setMetaError(null)
                }}
                placeholder="e.g. Introduction to Operating Systems"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Assessment type</label>
              <div className="grid grid-cols-3 gap-2">
                {(["Test", "Exam", "CAT"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEditType(t)}
                    className={
                      "min-h-10 rounded-xl border text-sm font-medium transition-colors " +
                      (editType === t
                        ? "bg-primary text-white border-primary"
                        : "bg-card border-border text-foreground")
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
            {metaError && <p className="text-sm text-danger">{metaError}</p>}
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setShowMeta(false)}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={savingMeta} onClick={saveMeta}>
                {savingMeta ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {toDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Delete this note?</h2>
            <p className="text-sm text-gray-500 break-words">{toDelete.title}</p>
            <p className="text-sm text-gray-500">
              Its quiz questions and quiz history will be deleted too. This cannot be undone.
            </p>
            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                disabled={deleting}
                onClick={() => setToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-danger hover:bg-danger/90"
                disabled={deleting}
                onClick={deleteMaterial}
              >
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}


      {/* Blocked duplicate upload */}
      {blockedShare && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Already shared</h2>
            <p className="text-sm text-gray-500">
              {course?.code} notes like this are already shared in your department by{" "}
              <span className="font-medium text-foreground">{blockedShare.sharer_name}</span>.
              Add them instead — no AI use.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setBlockedShare(null)}>
                Close
              </Button>
              <Button
                className="flex-1"
                onClick={() => addSharedNote(blockedShare)}
              >
                Add shared
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Share with department */}
      {shareTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Share with department</h2>
            <p className="text-sm text-gray-500 break-words">{shareTarget.title}</p>
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={shareChecked}
                onChange={(e) => setShareChecked(e.target.checked)}
              />
              <span>
                This is general class material for{" "}
                <strong>{profileDept || "my department"}</strong> at{" "}
                <strong>{profileInst || "my school"}</strong> — not private notes.
              </span>
            </label>
            {shareMsg && <p className="text-sm text-danger">{shareMsg}</p>}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setShareTarget(null)
                  setShareChecked(false)
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!shareChecked || sharing}
                onClick={shareMaterial}
              >
                {sharing ? "Sharing..." : "Share"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

