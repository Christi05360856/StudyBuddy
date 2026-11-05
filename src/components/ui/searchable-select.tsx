// PATH: src/components/ui/searchable-select.tsx
"use client"

// A dropdown list that works the same on every phone and computer.
// Tap it, a list opens, type to search, tap a name to pick it.
// If allowCustom is on, a student can also use a name that is not in the list.
// (This replaces the old <datalist>, which many phones show badly or not at all.)

import { useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

type SearchableSelectProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  allowCustom?: boolean
  title?: string
}

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Choose one",
  searchPlaceholder = "Search...",
  disabled = false,
  allowCustom = false,
  title = "Choose one",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  // Close with the Escape key
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  const trimmed = query.trim()
  const filtered = useMemo(() => {
    const q = trimmed.toLowerCase()
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options
  }, [options, trimmed])

  const exactMatch = options.some((o) => o.toLowerCase() === trimmed.toLowerCase())

  const close = () => {
    setOpen(false)
    setQuery("")
  }

  const pick = (v: string) => {
    onChange(v)
    close()
  }

  return (
    <>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 text-left text-base transition-shadow",
          "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
          "disabled:bg-muted disabled:text-gray-400"
        )}
      >
        <span className={cn("truncate", !value && "text-gray-400")}>{value || placeholder}</span>
        <ChevronDown size={18} className="shrink-0 text-gray-400" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 pt-10 sm:pt-4"
          onClick={close}
        >
          {/* Clicking inside the box must not close it */}
          <div
            className="w-full max-w-md bg-card rounded-2xl flex flex-col max-h-[70vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={title}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="font-semibold">{title}</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="p-1.5 -mr-1.5 rounded-full text-gray-500 hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pb-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-11 w-full rounded-xl border border-border pl-9 pr-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
            </div>

            <ul role="listbox" className="flex-1 overflow-y-auto border-t border-border">
              {allowCustom && trimmed && !exactMatch && (
                <li>
                  <button
                    type="button"
                    onClick={() => pick(trimmed)}
                    className="w-full text-left px-5 py-3.5 text-sm text-primary font-medium border-b border-border hover:bg-muted"
                  >
                    Use &ldquo;{trimmed}&rdquo;
                  </button>
                </li>
              )}

              {filtered.map((opt) => (
                <li key={opt}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={opt === value}
                    onClick={() => pick(opt)}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 text-left px-5 py-3.5 text-sm border-b border-border last:border-b-0 hover:bg-muted",
                      opt === value && "bg-primary/5 font-medium"
                    )}
                  >
                    <span>{opt}</span>
                    {opt === value && <Check size={16} className="text-primary shrink-0" />}
                  </button>
                </li>
              ))}

              {filtered.length === 0 && !(allowCustom && trimmed) && (
                <li className="px-5 py-8 text-center text-sm text-gray-500">Nothing found.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
