// PATH: src/lib/share.ts
/**
 * Department share helpers.
 * content_key groups near-identical notes so we do not burn AI twice.
 */

export function makeContentKey(params: {
  codeNormalized: string
  materialTitle: string
  fileSize: number | null | undefined
}): string {
  const title = params.materialTitle
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
  const size = params.fileSize ?? 0
  return `${params.codeNormalized}|${title}|${size}`
}

export type SharedMaterialRow = {
  id: string
  material_id: string
  user_id: string
  institution: string
  department: string
  code_normalized: string
  course_code: string
  course_title: string | null
  material_title: string
  file_size: number | null
  content_key: string
  sharer_name: string
  created_at: string
}
