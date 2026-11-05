import type { ReactNode } from "react"

/**
 * A small Markdown reader for the AI Tutor's replies.
 * It turns **bold**, *italic*, `code`, # headings, - lists, 1. lists and --- lines
 * into clean formatting, so students never see raw stars (*) and hashes (#).
 */

// Bold, italic and code inside one line of text
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s](?:[^*]*[^*\s])?\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-muted text-[13px] font-mono">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

// Text with line breaks kept
function withBreaks(text: string): ReactNode[] {
  return text.split("\n").flatMap((line, i) => (i === 0 ? [inline(line)] : [<br key={`br${i}`} />, inline(line)]))
}

type ListItem = { indent: number; ordered: boolean; text: string }

const LIST_LINE = /^(\s*)([*+-]|\d+[.)])\s+(.*)$/
const HEADING_LINE = /^(#{1,6})\s+(.*)$/
const RULE_LINE = /^\s*([-*_])(\s*\1){2,}\s*$/

// Builds nested lists (a bullet list inside a numbered list, and so on)
function renderList(items: ListItem[], start: number): { node: ReactNode; next: number } {
  const base = items[start].indent
  const ordered = items[start].ordered
  const rows: ReactNode[] = []
  let i = start

  // A new list starts when the list type changes (bullets vs numbers)
  while (i < items.length && items[i].indent === base && items[i].ordered === ordered) {
    const item = items[i]
    i++
    let children: ReactNode = null
    if (i < items.length && items[i].indent > base) {
      const nested = renderList(items, i)
      children = nested.node
      i = nested.next
    }
    rows.push(
      <li key={i}>
        {withBreaks(item.text)}
        {children}
      </li>
    )
  }

  const className = ordered
    ? "list-decimal pl-5 space-y-1.5"
    : "list-disc pl-5 space-y-1.5"
  return {
    node: ordered ? (
      <ol key={`l${start}`} className={className}>{rows}</ol>
    ) : (
      <ul key={`l${start}`} className={className}>{rows}</ul>
    ),
    next: i,
  }
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n")
  const blocks: ReactNode[] = []
  let i = 0

  const startsBlock = (line: string) =>
    LIST_LINE.test(line) || HEADING_LINE.test(line) || RULE_LINE.test(line) || line.trim().startsWith("```")

  while (i < lines.length) {
    const line = lines[i]

    // Empty line
    if (line.trim() === "") {
      i++
      continue
    }

    // Code block
    if (line.trim().startsWith("```")) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i])
        i++
      }
      i++
      blocks.push(
        <pre key={`c${i}`} className="overflow-x-auto rounded-xl bg-muted p-3 text-[13px] font-mono">
          {code.join("\n")}
        </pre>
      )
      continue
    }

    // Line like ---
    if (RULE_LINE.test(line)) {
      blocks.push(<hr key={`h${i}`} className="border-border" />)
      i++
      continue
    }

    // Headings
    const heading = line.match(HEADING_LINE)
    if (heading) {
      const level = heading[1].length
      const cls =
        level === 1
          ? "text-base font-bold pt-1"
          : level === 2
            ? "text-[15px] font-bold pt-1"
            : "text-sm font-semibold pt-1"
      blocks.push(<p key={`t${i}`} className={cls}>{inline(heading[2])}</p>)
      i++
      continue
    }

    // Lists
    if (LIST_LINE.test(line)) {
      const items: ListItem[] = []
      while (i < lines.length) {
        const current = lines[i]
        const match = current.match(LIST_LINE)
        if (match && !RULE_LINE.test(current)) {
          items.push({ indent: match[1].length, ordered: /\d/.test(match[2]), text: match[3] })
          i++
          continue
        }
        if (current.trim() === "") {
          // A blank line inside a list: keep going if more list text follows
          let j = i + 1
          while (j < lines.length && lines[j].trim() === "") j++
          if (j < lines.length && items.length > 0 && (LIST_LINE.test(lines[j]) || /^\s{2,}\S/.test(lines[j]))) {
            i = j
            continue
          }
          break
        }
        if (/^\s{2,}\S/.test(current) && items.length > 0) {
          // Extra text under a list item
          items[items.length - 1].text += "\n" + current.trim()
          i++
          continue
        }
        break
      }

      let k = 0
      while (k < items.length) {
        const result = renderList(items, k)
        blocks.push(result.node)
        k = result.next
      }
      continue
    }

    // Normal paragraph
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i])) {
      paragraph.push(lines[i])
      i++
    }
    if (paragraph.length === 0) {
      // safety: never get stuck
      paragraph.push(lines[i])
      i++
    }
    blocks.push(<p key={`p${i}`}>{withBreaks(paragraph.join("\n"))}</p>)
  }

  return <div className="space-y-2.5">{blocks}</div>
}
