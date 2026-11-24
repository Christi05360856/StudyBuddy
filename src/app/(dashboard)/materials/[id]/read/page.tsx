// PATH: src/app/(dashboard)/materials/[id]/read/page.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, Loader2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getExtension } from "@/lib/file-types"

/**
 * Reads study notes INSIDE the app.
 *  - Photos: shown directly.
 *  - PDF on a computer: the browser's own PDF viewer.
 *  - Everything else (Word, PowerPoint, Excel, text, and PDFs on phones):
 *    the server turns the file into readable content, so nothing is downloaded.
 * The original file is always available through the small "Original" link.
 * Does NOT use AI tokens.
 */

type Preview =
  | { kind: "html"; html: string }
  | { kind: "text"; text: string; ext: string }
  | { kind: "pages"; pages: { page: number; text: string }[] }
  | { kind: "unsupported"; reason: string }

type View =
  | { mode: "blob"; url: string; mime: string }
  | { mode: "preview"; data: Preview }

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
}

// Long files are cut by the reader at this size; tell the student instead of hiding it
const TEXT_CUT_NOTICE_AT = 149_000

function buildFrameDocument(body: string, dark: boolean): string {
  const fg = dark ? "#e8e8ee" : "#1a1a2e"
  const bg = dark ? "#14161d" : "#ffffff"
  const border = dark ? "#3a3d4a" : "#d4d7e0"
  const link = dark ? "#8fa8ff" : "#3b5bdb"
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
html,body{margin:0;padding:0;background:${bg};}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:16px;line-height:1.65;color:${fg};padding:16px;overflow-wrap:anywhere;}
img{max-width:100%;height:auto;}
table{border-collapse:collapse;display:block;overflow-x:auto;max-width:100%;}
td,th{border:1px solid ${border};padding:6px 8px;vertical-align:top;}
h1,h2,h3,h4,h5,h6{line-height:1.3;}
a{color:${link};}
pre{white-space:pre-wrap;}
p{margin:0 0 0.9em;}
</style></head><body>${body}</body></html>`
}

// Word documents: shown inside a frame that cannot run scripts, so a file can never harm the page
function HtmlFrame({ html, dark, title }: { html: string; dark: boolean; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(480)
  const srcDoc = buildFrameDocument(html, dark)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let observer: ResizeObserver | null = null

    const measure = () => {
      const body = el.contentDocument?.body
      if (!body) return
      const h = body.offsetHeight
      if (h > 0) setHeight(h)
    }
    const onLoad = () => {
      measure()
      const body = el.contentDocument?.body
      if (body && typeof ResizeObserver !== "undefined") {
        observer?.disconnect()
        observer = new ResizeObserver(measure)
        observer.observe(body)
      }
    }

    el.addEventListener("load", onLoad)
    if (el.contentDocument?.readyState === "complete") onLoad()
    return () => {
      el.removeEventListener("load", onLoad)
      observer?.disconnect()
    }
  }, [srcDoc])

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      scrolling="no"
      className="block w-full border-0 rounded-2xl"
      style={{ height }}
    />
  )
}

// "--- Slide 3 ---" style markers from the file reader become separate cards
function splitSections(text: string): { heading: string | null; body: string }[] {
  const lines = text.replace(/\r/g, "").split("\n")
  const sections: { heading: string | null; lines: string[] }[] = []
  let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] }
  for (const line of lines) {
    const m = line.match(/^---\s*(.+?)\s*---$/)
    if (m) {
      if (current.heading !== null || current.lines.some((l) => l.trim())) sections.push(current)
      current = { heading: m[1], lines: [] }
    } else {
      current.lines.push(line)
    }
  }
  if (current.heading !== null || current.lines.some((l) => l.trim())) sections.push(current)
  return sections.map((s) => ({ heading: s.heading, body: s.lines.join("\n").trim() }))
}

function TextReader({ text, ext }: { text: string; ext: string }) {
  const sections = splitSections(text)
  const mono = ext === "xlsx" || ext === "csv"
  return (
    <div className="space-y-3">
      {sections.map((s, i) => (
        <section key={i} className="rounded-2xl border border-border bg-card px-4 py-3">
          {s.heading ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary mb-2">
              {s.heading}
            </p>
          ) : null}
          <div
            className={
              mono
                ? "overflow-x-auto whitespace-pre font-mono text-[13px] leading-relaxed"
                : "whitespace-pre-wrap text-[15px] leading-relaxed [overflow-wrap:anywhere]"
            }
          >
            {s.body}
          </div>
        </section>
      ))}
      {text.length >= TEXT_CUT_NOTICE_AT && (
        <p className="text-xs text-gray-500 text-center">
          This is a very long file, so only the first part is shown here. Use “Original” to see everything.
        </p>
      )}
    </div>
  )
}

function PagesReader({ pages }: { pages: { page: number; text: string }[] }) {
  return (
    <div className="space-y-3">
      {pages.map((p) => (
        <section key={p.page} className="rounded-2xl border border-border bg-card px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary mb-2">
            Page {p.page}
          </p>
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed [overflow-wrap:anywhere]">
            {p.text}
          </div>
        </section>
      ))}
      <p className="text-xs text-gray-500 text-center">
        This is the text of the PDF. Pictures and diagrams are not shown. Use “Original” to see the full page layout.
      </p>
    </div>
  )
}

export default function MaterialReadPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [title, setTitle] = useState("Reading")
  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [dark, setDark] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark")
  }, [])

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    const supabase = createClient()

    const loadPreview = async (): Promise<Preview> => {
      const res = await fetch(`/api/materials/${id}/preview`, { cache: "no-store" })
      const body = (await res.json().catch(() => null)) as (Preview & { error?: string }) | null
      if (!res.ok || !body || !("kind" in body)) {
        throw new Error((body && "error" in body && body.error) || "Could not load this note.")
      }
      return body
    }

    const load = async () => {
      setLoading(true)
      setError(null)
      setView(null)
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
          .select("id, title, file_path")
          .eq("id", id)
          .single()
        if (matErr || !material) {
          setError("Material not found.")
          return
        }
        if (!cancelled) setTitle(material.title || "Lecture note")

        const ext = getExtension(material.file_path)

        // The original file is only a side option now (never the main path)
        const { data: signed } = await supabase.storage
          .from("materials")
          .createSignedUrl(material.file_path, 60 * 60)
        if (!cancelled && signed?.signedUrl) setOriginalUrl(signed.signedUrl)

        const isTouch = window.matchMedia?.("(pointer: coarse)").matches ?? false

        // 1) Photos
        if (IMAGE_MIME[ext]) {
          if (!signed?.signedUrl) throw new Error("Could not open this file. Please try again.")
          const res = await fetch(signed.signedUrl)
          if (!res.ok) throw new Error("fetch failed")
          const blob = new Blob([await res.arrayBuffer()], { type: IMAGE_MIME[ext] })
          objectUrl = URL.createObjectURL(blob)
          if (!cancelled) setView({ mode: "blob", url: objectUrl, mime: IMAGE_MIME[ext] })
          return
        }

        // 2) PDF on a computer: the browser's own viewer is best. Phones cannot show PDFs inside a page.
        if (ext === "pdf" && !isTouch && signed?.signedUrl) {
          try {
            const res = await fetch(signed.signedUrl)
            if (!res.ok) throw new Error("fetch failed")
            const blob = new Blob([await res.arrayBuffer()], { type: "application/pdf" })
            objectUrl = URL.createObjectURL(blob)
            if (!cancelled) setView({ mode: "blob", url: objectUrl, mime: "application/pdf" })
            return
          } catch {
            // fall through to the text reader
          }
        }

        // 3) Word, PowerPoint, Excel, text, and PDFs on phones: read inside the app
        const data = await loadPreview()
        if (!cancelled) setView({ mode: "preview", data })
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error && err.message && err.message !== "fetch failed"
              ? err.message
              : "Could not load this note. Please check your connection and try again."
          )
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
  }, [id, attempt])

  const unsupported = view?.mode === "preview" && view.data.kind === "unsupported" ? view.data.reason : null

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 -ml-1 rounded-full hover:bg-muted"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <p className="font-semibold text-sm truncate flex-1">{title}</p>
          {originalUrl && (
            <a
              href={originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 font-medium inline-flex items-center gap-1 shrink-0"
            >
              <Download size={14} />
              Original
            </a>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0">
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="animate-spin text-primary" size={28} />
            <p className="text-xs text-gray-500">Opening your note…</p>
          </div>
        )}

        {!loading && error && (
          <div className="p-6 text-center space-y-4 max-w-md mx-auto">
            <p className="text-sm text-gray-600">{error}</p>
            <div className="flex flex-col gap-2">
              <Button type="button" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
              <Button variant="outline" onClick={() => router.back()}>
                Go back
              </Button>
            </div>
          </div>
        )}

        {!loading && !error && view?.mode === "blob" && view.mime === "application/pdf" && (
          <iframe
            title={title}
            src={view.url}
            className="flex-1 w-full min-h-[calc(100vh-3.5rem)] border-0 bg-muted"
          />
        )}

        {!loading && !error && view?.mode === "blob" && view.mime.startsWith("image/") && (
          <div className="flex-1 overflow-auto p-4 flex justify-center bg-muted/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={view.url} alt={title} className="max-w-full h-auto rounded-lg shadow" />
          </div>
        )}

        {!loading && !error && view?.mode === "preview" && !unsupported && (
          <div className="w-full max-w-3xl mx-auto px-4 py-4 pb-16">
            {view.data.kind === "html" && <HtmlFrame html={view.data.html} dark={dark} title={title} />}
            {view.data.kind === "text" && <TextReader text={view.data.text} ext={view.data.ext} />}
            {view.data.kind === "pages" && <PagesReader pages={view.data.pages} />}
          </div>
        )}

        {!loading && !error && unsupported && (
          <div className="p-6 text-center space-y-4 max-w-md mx-auto">
            <p className="text-sm text-gray-600">{unsupported}</p>
            {originalUrl && (
              <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex">
                <Button type="button">Open original</Button>
              </a>
            )}
            <div>
              <Button variant="outline" onClick={() => router.back()}>
                Go back
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
