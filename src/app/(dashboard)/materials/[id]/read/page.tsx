// PATH: src/app/(dashboard)/materials/[id]/read/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, Loader2, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getExtension } from "@/lib/file-types"

/**
 * Opens study files inside the app.
 * Mobile often downloads when navigating to a raw storage URL; we fetch as a blob
 * with the correct MIME type and embed it so students can read without downloading.
 * Does NOT use AI tokens.
 */
export default function MaterialReadPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [title, setTitle] = useState("Reading")
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [mime, setMime] = useState("application/pdf")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [signedFallback, setSignedFallback] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          setError("Please log in again.")
          return
        }

        const { data: material, error: matErr } = await supabase
          .from("materials")
          .select("id, title, file_path, user_id")
          .eq("id", id)
          .single()

        if (matErr || !material) {
          setError("Material not found.")
          return
        }
        if (!cancelled) setTitle(material.title || "Lecture note")

        const ext = getExtension(material.file_path)
        const mimeMap: Record<string, string> = {
          pdf: "application/pdf",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          webp: "image/webp",
          gif: "image/gif",
        }
        const type = mimeMap[ext] || "application/octet-stream"
        if (!cancelled) setMime(type)

        const { data: signed, error: signErr } = await supabase.storage
          .from("materials")
          .createSignedUrl(material.file_path, 60 * 60)

        if (signErr || !signed?.signedUrl) {
          setError("Could not open this file. Please try again.")
          return
        }
        if (!cancelled) setSignedFallback(signed.signedUrl)

        // Prefer blob embed so phones don't force a download
        const res = await fetch(signed.signedUrl)
        if (!res.ok) throw new Error("fetch failed")
        const buf = await res.arrayBuffer()
        const blob = new Blob([buf], { type })
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) setBlobUrl(objectUrl)
      } catch {
        if (!cancelled) {
          setError("Could not load the file in the app. You can open it in a new tab instead.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id, supabase])

  const isImage = mime.startsWith("image/")
  const isPdf = mime === "application/pdf"

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 -ml-1 rounded-full hover:bg-muted"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <p className="font-semibold text-sm truncate flex-1">{title}</p>
          {signedFallback && (
            <a
              href={signedFallback}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary font-medium inline-flex items-center gap-1 shrink-0"
            >
              <ExternalLink size={14} />
              New tab
            </a>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0">
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
        )}

        {!loading && error && (
          <div className="p-6 text-center space-y-4">
            <p className="text-sm text-gray-600">{error}</p>
            {signedFallback && (
              <a
                href={signedFallback}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button type="button">Open in new tab</Button>
              </a>
            )}
            <Button variant="outline" onClick={() => router.back()}>
              Go back
            </Button>
          </div>
        )}

        {!loading && !error && blobUrl && isPdf && (
          <iframe
            title={title}
            src={blobUrl}
            className="flex-1 w-full min-h-[calc(100vh-3.5rem)] border-0 bg-muted"
          />
        )}

        {!loading && !error && blobUrl && isImage && (
          <div className="flex-1 overflow-auto p-4 flex justify-center bg-muted/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={blobUrl} alt={title} className="max-w-full h-auto rounded-lg shadow" />
          </div>
        )}

        {!loading && !error && blobUrl && !isPdf && !isImage && (
          <div className="p-6 text-center space-y-4">
            <p className="text-sm text-gray-600">
              This file type is best opened outside the app (Word, PowerPoint, Excel).
            </p>
            {signedFallback && (
              <a
                href={signedFallback}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button type="button">Open file</Button>
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
