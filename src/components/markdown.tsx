// PATH: src/components/markdown.tsx
import type { ReactNode } from "react"

/**
 * A small Markdown reader for the AI Tutor's replies.
 * Also turns common LaTeX fragments into plain readable math so students
 * never see raw $ \frac{}{} $ noise.
 */

/** Convert common LaTeX / $math$ into readable plain text. */
export function latexToReadable(input: string): string {
  let s = input

  // Block and inline math delimiters → keep inner content
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner: string) => `\n${inner.trim()}\n`)
  s = s.replace(/\$([^$\n]+)\$/g, (_, inner: string) => inner)

  // \frac{a}{b} → (a) / (b)  (repeat for nesting depth)
  for (let n = 0; n < 6; n++) {
    const next = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1) / ($2)")
    if (next === s) break
    s = next
  }

  // \text{...} \mathrm{...}
  s = s.replace(/\\text\s*\{([^{}]*)\}/g, "$1")
  s = s.replace(/\\mathrm\s*\{([^{}]*)\}/g, "$1")
  s = s.replace(/\\mathbf\s*\{([^{}]*)\}/g, "$1")

  // Superscripts / subscripts: 10^9, x^{2}, a_1, a_{ij}
  s = s.replace(/\^\{([^{}]+)\}/g, "^($1)")
  s = s.replace(/_\{([^{}]+)\}/g, "_($1)")
  s = s.replace(/\^(\w)/g, "^$1")
  s = s.replace(/_(\w)/g, "_$1")

  // Common symbols
  const symbols: [RegExp, string][] = [
    [/\\times/g, "×"],
    [/\\cdot/g, "·"],
    [/\\div/g, "÷"],
    [/\\pm/g, "±"],
    [/\\approx/g, "≈"],
    [/\\neq/g, "≠"],
    [/\\leq/g, "≤"],
    [/\\geq/g, "≥"],
    [/\\le\b/g, "≤"],
    [/\\ge\b/g, "≥"],
    [/\\infty/g, "∞"],
    [/\\rightarrow/g, "→"],
    [/\\to\b/g, "→"],
    [/\\leftarrow/g, "←"],
    [/\\Rightarrow/g, "⇒"],
    [/\\ldots/g, "…"],
    [/\\dots/g, "…"],
    [/\\%/g, "%"],
    [/\\_/g, "_"],
    [/\\,/g, " "],
    [/\\;/g, " "],
    [/\\!/g, ""],
    [/\\quad/g, "  "],
    [/\\qquad/g, "   "],
    [/\\left\s*/g, ""],
    [/\\right\s*/g, ""],
    [/\\big[lrm]?\s*/g, ""],
  ]
  for (const [re, rep] of symbols) s = s.replace(re, rep)

  // Strip remaining simple \commands
  s = s.replace(/\\([a-zA-Z]+)\s*/g, "$1 ")

  // Clean extra spaces inside parens from frac conversion
  s = s.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")")
  s = s.replace(/[ \t]{2,}/g, " ")

  return s
}

// Bold, italic and code inside one line of text
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s](?:[^*]*[^*\s])?\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      )
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

function withBreaks(text: string): ReactNode[] {
  return text
    .split("\n")
    .flatMap((line, i) => (i === 0 ? [inline(line)] : [<br key={`br${i}`} />, inline(line)]))
}

type ListItem = { indent: number; ordered: boolean; text: string }

const LIST_LINE = /^(\s*)([*+-]|\d+[.)])\s+(.*)$/
const HEADING_LINE = /^(#{1,6})\s+(.*)$/
const RULE_LINE = /^\s*([-*_])(\s*\1){2,}\s*$/

function renderList(items: ListItem[], start: number): { node: ReactNode; next: number } {
  const base = items[start].indent
  const ordered = items[start].ordered
  const rows: ReactNode[] = []
  let i = start

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

  const className = ordered ? "list-decimal pl-5 space-y-1.5" : "list-disc pl-5 space-y-1.5"
  return {
    node: ordered ? (
      <ol key={`l${start}`} className={className}>
        {rows}
      </ol>
    ) : (
      <ul key={`l${start}`} className={className}>
        {rows}
      </ul>
    ),
    next: i,
  }
}

export function Markdown({ text }: { text: string }) {
  // Clean LaTeX first so lists/headings still parse
  const cleaned = latexToReadable(text)
  const lines = cleaned.replace(/\r/g, "").split("\n")
  const blocks: ReactNode[] = []
  let i = 0

  const startsBlock = (line: string) =>
    LIST_LINE.test(line) || HEADING_LINE.test(line) || RULE_LINE.test(line) || line.trim().startsWith("```")

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === "") {
      i++
      continue
    }

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

    if (RULE_LINE.test(line)) {
      blocks.push(<hr key={`h${i}`} className="border-border" />)
      i++
      continue
    }

    const heading = line.match(HEADING_LINE)
    if (heading) {
      const level = heading[1].length
      const cls =
        level === 1 ? "text-base font-bold pt-1" : level === 2 ? "text-[15px] font-bold pt-1" : "text-sm font-semibold pt-1"
      blocks.push(
        <p key={`t${i}`} className={cls}>
          {inline(heading[2])}
        </p>
      )
      i++
      continue
    }

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
          let j = i + 1
          while (j < lines.length && lines[j].trim() === "") j++
          if (j < lines.length && items.length > 0 && (LIST_LINE.test(lines[j]) || /^\s{2,}\S/.test(lines[j]))) {
            i = j
            continue
          }
          break
        }
        if (/^\s{2,}\S/.test(current) && items.length > 0) {
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

    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i])) {
      paragraph.push(lines[i])
      i++
    }
    if (paragraph.length === 0) {
      paragraph.push(lines[i])
      i++
    }
    blocks.push(
      <p key={`p${i}`} className="leading-relaxed">
        {withBreaks(paragraph.join("\n"))}
      </p>
    )
  }

  return <div className="space-y-2.5">{blocks}</div>
}
