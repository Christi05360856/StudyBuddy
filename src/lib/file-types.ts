// PATH: src/lib/file-types.ts
// The kinds of study files students can upload.
// This file is safe to use in the browser AND on the server (it imports nothing heavy).

export type FileKind = "pdf" | "image" | "word" | "legacy-word" | "powerpoint" | "excel" | "text"

export type TypeInfo = { kind: FileKind; label: string; mime?: string }

export const FILE_TYPES: Record<string, TypeInfo> = {
  pdf: { kind: "pdf", label: "PDF", mime: "application/pdf" },
  docx: { kind: "word", label: "Word" },
  doc: { kind: "legacy-word", label: "Word" },
  pptx: { kind: "powerpoint", label: "PowerPoint" },
  xlsx: { kind: "excel", label: "Excel" },
  txt: { kind: "text", label: "Text" },
  md: { kind: "text", label: "Text" },
  csv: { kind: "text", label: "CSV" },
  jpg: { kind: "image", label: "Photo", mime: "image/jpeg" },
  jpeg: { kind: "image", label: "Photo", mime: "image/jpeg" },
  png: { kind: "image", label: "Photo", mime: "image/png" },
  webp: { kind: "image", label: "Photo", mime: "image/webp" },
}

// For the file picker: ".pdf,.docx,.doc,..."
// Extensions are used (not MIME types) because many Android phones report Word and Excel
// files with an empty type, which would wrongly block them.
export const ACCEPT_ATTRIBUTE = Object.keys(FILE_TYPES)
  .map((ext) => `.${ext}`)
  .join(",")

export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase()
}

// Removes the ending from a file name: "Lecture 1.docx" -> "Lecture 1"
export function stripExtension(fileName: string): string {
  const ext = getExtension(fileName)
  return ext && FILE_TYPES[ext] ? fileName.slice(0, -(ext.length + 1)) : fileName
}
