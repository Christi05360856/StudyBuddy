// PATH: src/lib/ai/retrieval.ts
/**
 * Phase 2 — Save / load original material chunks for the Tutor.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { SourceChunk } from "@/lib/ai/source-text"

export type RetrievedChunk = {
  chunk_index: number
  content: string
  page_start: number | null
  page_end: number | null
  heading: string | null
  rank?: number
}

/** Replace all chunks for a material (after process / reprocess). */
export async function replaceMaterialChunks(
  supabase: SupabaseClient,
  opts: { materialId: string; userId: string; chunks: SourceChunk[] }
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const { materialId, userId, chunks } = opts

  const { error: delError } = await supabase
    .from("material_chunks")
    .delete()
    .eq("material_id", materialId)

  if (delError) {
    // Table may not exist yet — soft fail so processing still completes
    if (/does not exist|schema cache|relation/i.test(delError.message)) {
      return { ok: false, error: "material_chunks table missing (run supabase-update-material-chunks.sql)" }
    }
    return { ok: false, error: delError.message }
  }

  if (chunks.length === 0) return { ok: true, count: 0 }

  const rows = chunks.map((c) => ({
    material_id: materialId,
    user_id: userId,
    chunk_index: c.chunk_index,
    content: c.content.slice(0, 8000),
    page_start: c.page_start,
    page_end: c.page_end,
    heading: c.heading,
  }))

  // Insert in batches of 40
  for (let i = 0; i < rows.length; i += 40) {
    const batch = rows.slice(i, i + 40)
    const { error } = await supabase.from("material_chunks").insert(batch)
    if (error) return { ok: false, error: error.message }
  }

  return { ok: true, count: rows.length }
}

/**
 * Retrieve the most relevant original passages for a topic / student question.
 * Falls back to sequential chunks if FTS is empty or unavailable.
 */
export async function retrieveMaterialChunks(
  supabase: SupabaseClient,
  opts: {
    materialId: string
    query: string
    limit?: number
  }
): Promise<RetrievedChunk[]> {
  const limit = Math.min(Math.max(opts.limit ?? 6, 1), 12)
  const query = (opts.query || "").trim().slice(0, 300)

  // Prefer Postgres rank function when migration is applied
  const { data: ranked, error: rpcError } = await supabase.rpc("match_material_chunks", {
    p_material_id: opts.materialId,
    p_query: query || "overview",
    p_limit: limit,
  })

  if (!rpcError && Array.isArray(ranked) && ranked.length > 0) {
    return ranked.map((r: Record<string, unknown>) => ({
      chunk_index: Number(r.chunk_index) || 0,
      content: String(r.content || ""),
      page_start: r.page_start == null ? null : Number(r.page_start),
      page_end: r.page_end == null ? null : Number(r.page_end),
      heading: r.heading == null ? null : String(r.heading),
      rank: typeof r.rank === "number" ? r.rank : undefined,
    }))
  }

  // Fallback: load first N chunks in order (or simple keyword filter in JS)
  const { data: all, error } = await supabase
    .from("material_chunks")
    .select("chunk_index, content, page_start, page_end, heading")
    .eq("material_id", opts.materialId)
    .order("chunk_index", { ascending: true })
    .limit(40)

  if (error || !all || all.length === 0) return []

  if (!query) {
    return all.slice(0, limit).map((r) => ({
      chunk_index: r.chunk_index,
      content: r.content,
      page_start: r.page_start,
      page_end: r.page_end,
      heading: r.heading,
    }))
  }

  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 2)
    .slice(0, 12)

  const scored = all.map((r) => {
    const hay = `${r.heading || ""} ${r.content}`.toLowerCase()
    let score = 0
    for (const t of terms) {
      if (hay.includes(t)) score += 1
    }
    return { r, score }
  })
  scored.sort((a, b) => b.score - a.score || a.r.chunk_index - b.r.chunk_index)

  const top = (scored[0]?.score ?? 0) > 0 ? scored.filter((s) => s.score > 0) : scored
  return top.slice(0, limit).map(({ r, score }) => ({
    chunk_index: r.chunk_index,
    content: r.content,
    page_start: r.page_start,
    page_end: r.page_end,
    heading: r.heading,
    rank: score,
  }))
}

/** Format chunks for the Tutor user prompt. */
export function formatChunksForTutor(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return ""
  return chunks
    .map((c, i) => {
      const loc =
        c.page_start != null
          ? `Page ${c.page_start}${c.page_end != null && c.page_end !== c.page_start ? `–${c.page_end}` : ""}`
          : c.heading || `Passage ${i + 1}`
      return `[${loc}]\n${c.content.trim()}`
    })
    .join("\n\n")
}
