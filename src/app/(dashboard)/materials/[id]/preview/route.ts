// PATH: src/app/api/materials/[id]/preview/route.ts
// Turns a student's study file into something the phone can READ inside the app
// (no download, no AI tokens). Word -> formatted HTML, everything else -> text.
import { NextRequest, NextResponse } from "next/server"
import mammoth from "mammoth"
import { createClient } from "@/lib/supabase/server"
import { extractContent } from "@/lib/extract-content"
import { getExtension } from "@/lib/file-types"

export const runtime = "nodejs"
export const maxDuration = 60

// Bigger files are not previewed (they would be slow on a phone); the original is still one tap away
const MAX_BYTES = 25 * 1024 * 1024
const MAX_HTML_CHARS = 4_000_000

export type PreviewPayload =
  | { kind: "html"; html: string }
  | { kind: "text"; text: string; ext: string }
  | { kind: "pages"; pages: { page: number; text: string }[] }
  | { kind: "unsupported"; reason: string }

function json(body: PreviewPayload, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, max-age=300" },
  })
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 })

    // Same access rules as the reader page: the database decides what this student may open
    const { data: material } = await supabase
      .from("materials")
      .select("id, file_path")
      .eq("id", id)
      .maybeSingle()
    if (!material) return NextResponse.json({ error: "Material not found." }, { status: 404 })

    const { data: file, error: downloadError } = await supabase.storage
      .from("materials")
      .download(material.file_path)
    if (downloadError || !file) {
      return NextResponse.json({ error: "Could not open this file. Please try again." }, { status: 502 })
    }
    if (file.size > MAX_BYTES) {
      return json({ kind: "unsupported", reason: "This file is too large to show here." })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = getExtension(material.file_path)

    // Word (.docx): keep headings, lists, tables and pictures
    if (ext === "docx") {
      try {
        const result = await mammoth.convertToHtml({ buffer })
        const html = result.value
          // belt and braces: the page also shows this inside a sandbox that cannot run scripts
          .replace(/href\s*=\s*"\s*javascript:[^"]*"/gi, 'href="#"')
        const plain = html.replace(/<[^>]+>/g, "").trim()
        if (plain.length > 0 && html.length <= MAX_HTML_CHARS) {
          return json({ kind: "html", html })
        }
      } catch (err) {
        console.error("preview docx html failed, trying plain text:", err)
      }
    }

    // Everything else (and big/odd Word files): the same reader the AI uses, shown as text
    const extracted = await extractContent(buffer, material.file_path)
    if (!extracted.ok) return json({ kind: "unsupported", reason: extracted.error })

    const input = extracted.input
    if (input.type === "text") return json({ kind: "text", text: input.text, ext })
    if (input.type === "pages") return json({ kind: "pages", pages: input.pages })

    // Scans and photos have no text we can show
    return json({
      kind: "unsupported",
      reason: "This file is made of pictures, so it can only be viewed as the original.",
    })
  } catch (err) {
    console.error("material preview error:", err)
    return NextResponse.json({ error: "Could not load a preview. Please try again." }, { status: 500 })
  }
}
