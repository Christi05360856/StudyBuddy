// PATH: src/lib/extract-content.ts
// Turns an uploaded study file into something the AI can read.
//
//  - PDF and photos (JPG, PNG, WEBP): sent straight to the AI, which can read them (even scans).
//  - Word (.docx, .doc), PowerPoint (.pptx), Excel (.xlsx), text (.txt, .md, .csv):
//    the text is pulled out here first, then sent to the AI as plain text.

import mammoth from "mammoth"
import WordExtractor from "word-extractor"
import JSZip from "jszip"
import readXlsxFile from "read-excel-file/node"
import { FILE_TYPES, getExtension, type FileKind } from "@/lib/file-types"

// ---------- What the AI receives ----------

export type MaterialInput =
  | { type: "inline"; mimeType: string; base64: string; kind: FileKind }
  | { type: "text"; text: string; kind: FileKind }

// Longest text we send to the AI. Very long files are cut here so the AI answers in time.
const MAX_TEXT_CHARS = 150_000

// Spreadsheets: do not read endless rows
const MAX_SHEET_ROWS = 300
const MAX_SHEETS = 10

export type ExtractResult =
  | { ok: true; input: MaterialInput }
  | { ok: false; error: string }

function tidy(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function asText(text: string, kind: FileKind): ExtractResult {
  const clean = tidy(text)
  if (clean.length < 40) {
    return {
      ok: false,
      error:
        "We could not find readable text in this file. If it only contains pictures, save it as a PDF or upload a clear photo instead.",
    }
  }
  return { ok: true, input: { type: "text", text: clean.slice(0, MAX_TEXT_CHARS), kind } }
}

// PowerPoint: read the text of every slide, in order
async function readPowerPoint(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]))

  const decode = (s: string) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")

  const parts: string[] = []
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async("string")
    // Each paragraph is <a:p>...</a:p>, each piece of text is <a:t>...</a:t>
    const paragraphs = xml.match(/<a:p[ >][\s\S]*?<\/a:p>/g) ?? []
    const lines = paragraphs
      .map((p) =>
        (p.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) ?? [])
          .map((t) => decode(t.replace(/<[^>]+>/g, "")))
          .join("")
          .trim()
      )
      .filter(Boolean)
    if (lines.length > 0) parts.push(`--- Slide ${i + 1} ---\n${lines.join("\n")}`)
  }
  return parts.join("\n\n")
}

// Excel: every sheet becomes simple text rows (cells separated by " | ")
async function readExcel(buffer: Buffer): Promise<string> {
  const sheets = (await readXlsxFile(buffer)).slice(0, MAX_SHEETS)
  const parts: string[] = []

  for (const { sheet, data } of sheets) {
    if (data.length === 0) continue
    const shown = data.slice(0, MAX_SHEET_ROWS)
    const lines = shown.map((row) =>
      row
        .map((cell) => (cell === null || cell === undefined ? "" : String(cell)))
        .join(" | ")
        .trim()
    )
    const note =
      data.length > shown.length ? `\n(${data.length - shown.length} more rows not shown)` : ""
    parts.push(`--- Sheet: ${sheet} (${data.length} rows) ---\n${lines.join("\n")}${note}`)
  }
  return parts.join("\n\n")
}

export async function extractContent(buffer: Buffer, fileName: string): Promise<ExtractResult> {
  const ext = getExtension(fileName)
  const info = FILE_TYPES[ext]

  if (!info) {
    return {
      ok: false,
      error:
        ext === "xls"
          ? "Old Excel (.xls) files are not supported. Open it and choose Save As > Excel Workbook (.xlsx), then upload again."
          : ext === "ppt"
            ? "Old PowerPoint (.ppt) files are not supported. Save it as .pptx or PDF, then upload again."
            : "This file type is not supported. Use PDF, Word, PowerPoint, Excel, a text file or a photo.",
    }
  }

  try {
    switch (info.kind) {
      case "pdf":
      case "image":
        return {
          ok: true,
          input: {
            type: "inline",
            mimeType: info.mime!,
            base64: buffer.toString("base64"),
            kind: info.kind,
          },
        }

      case "word": {
        const result = await mammoth.extractRawText({ buffer })
        return asText(result.value, "word")
      }

      case "legacy-word": {
        const doc = await new WordExtractor().extract(buffer)
        return asText(doc.getBody(), "legacy-word")
      }

      case "powerpoint":
        return asText(await readPowerPoint(buffer), "powerpoint")

      case "excel":
        return asText(await readExcel(buffer), "excel")

      case "text":
        return asText(buffer.toString("utf-8"), "text")
    }
  } catch (err) {
    console.error("extractContent error:", err)
    return {
      ok: false,
      error: `We could not open this ${info.label} file. It may be damaged or password protected.`,
    }
  }
}
