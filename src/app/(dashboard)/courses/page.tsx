// PATH: src/app/(dashboard)/courses/page.tsx
"use client"

import { useEffect, useState } from "react"
import { BottomNav } from "@/components/bottom-nav"
import { Plus, ChevronRight, Loader2, Trash2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BackButton } from "@/components/back-button"
import { createClient } from "@/lib/supabase/client"
import {
  formatCourseCodeInput,
  normalizeCourseCode,
  toCodeNormalized,
  toTitleCase,
  isValidTitle,
} from "@/lib/course-code"

type Course = {
  id: string
  code: string
  title: string | null
  created_at: string
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [code, setCode] = useState("")
  const [title, setTitle] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [toDelete, setToDelete] = useState<Course | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  const supabase = createClient()

  const loadCourses = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from("courses")
      .select("id, code, title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (!error && data) {
      setCourses(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadCourses()
  }, [])

  const openAdd = () => {
    setCode("")
    setTitle("")
    setError(null)
    setShowAdd(true)
  }

  const handleAdd = async () => {
    const canonical = normalizeCourseCode(code)
    const cleanTitle = toTitleCase(title)

    if (!canonical) {
      setError("Use a code like CSC 204 or GST 111A (2–4 letters, space, 3 digits).")
      return
    }
    if (!isValidTitle(cleanTitle)) {
      setError("Title must be between 3 and 80 characters.")
      return
    }

    const normalized = toCodeNormalized(canonical)
    if (courses.some((c) => toCodeNormalized(c.code) === normalized)) {
      setError(`You have already added ${canonical}.`)
      return
    }

    setSaving(true)
    setError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError("You must be logged in")
      setSaving(false)
      return
    }

    const { error: insertError } = await supabase.from("courses").insert({
      user_id: user.id,
      code: canonical,
      code_normalized: normalized,
      title: cleanTitle,
    })

    if (insertError) {
      if (insertError.code === "23505") {
        setError(`You have already added ${canonical}.`)
      } else {
        setError(insertError.message)
      }
      setSaving(false)
      return
    }

    setShowAdd(false)
    setSaving(false)
    loadCourses()
  }

  const deleteCourse = async () => {
    if (!toDelete) return
    setDeleting(true)
    setPageError(null)

    const { data: mats } = await supabase
      .from("materials")
      .select("file_path")
      .eq("course_id", toDelete.id)

    const { data, error } = await supabase
      .from("courses")
      .delete()
      .eq("id", toDelete.id)
      .select("id")

    if (error || !data || data.length === 0) {
      setPageError("Could not delete this course. Please try again.")
      setDeleting(false)
      setToDelete(null)
      return
    }

    const paths = (mats ?? []).map((m) => m.file_path)
    if (paths.length > 0) {
      await supabase.storage.from("materials").remove(paths)
    }

    setCourses((prev) => prev.filter((c) => c.id !== toDelete.id))
    setDeleting(false)
    setToDelete(null)
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-5 pt-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BackButton fallback="/home" />
            <h1 className="text-2xl font-bold">My Courses</h1>
          </div>
          <button
            onClick={openAdd}
            aria-label="Add a course"
            className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center"
          >
            <Plus size={20} />
          </button>
        </div>

        {pageError && (
          <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-lg mb-4">{pageError}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 mb-4">No courses yet</p>
            <Button onClick={openAdd}>Add your first course</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-2xl bg-card border border-border hover:border-primary/30 transition-colors"
              >
                <Link href={`/courses/${c.id}`} className="flex flex-1 min-w-0 items-center gap-4 p-4">
                  <div className="w-12 h-12 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {c.code.split(" ")[0].slice(0, 4)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{c.code}</p>
                    {c.title ? (
                      <p className="text-sm text-gray-500 truncate">{c.title}</p>
                    ) : (
                      <p className="text-sm text-amber-600">Add a title</p>
                    )}
                  </div>
                  <ChevronRight size={18} className="text-gray-400 shrink-0" />
                </Link>
                <button
                  onClick={() => setToDelete(c)}
                  aria-label={`Delete ${c.code}`}
                  className="mr-3 w-10 h-10 shrink-0 rounded-xl text-gray-400 flex items-center justify-center hover:text-danger hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Add Course</h2>
            <div>
              <label htmlFor="course-code" className="block text-sm font-medium mb-1">
                Course code
              </label>
              <Input
                id="course-code"
                placeholder="e.g. CSC 201"
                value={code}
                onChange={(e) => {
                  setCode(formatCourseCodeInput(e.target.value))
                  setError(null)
                }}
                autoFocus
                required
              />
              <p className="text-xs text-gray-400 mt-1">Format: CSC 204 or GST 111A</p>
            </div>
            <div>
              <label htmlFor="course-title" className="block text-sm font-medium mb-1">
                Course title
              </label>
              <Input
                id="course-title"
                placeholder="e.g. Introduction to Operating Systems"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setError(null)
                }}
                required
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!code.trim() || !title.trim() || saving}
                onClick={handleAdd}
              >
                {saving ? "Adding..." : "Add"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Delete {toDelete.code}?</h2>
            <p className="text-sm text-gray-500">
              All notes, quiz questions and quiz history inside this course will be deleted too.
              This cannot be undone.
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
                onClick={deleteCourse}
              >
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
