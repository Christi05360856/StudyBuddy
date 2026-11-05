// PATH: src/components/theme-toggle.tsx
"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

type Choice = "light" | "dark" | "system"
const KEY = "sb_theme"

function apply(choice: Choice) {
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.dataset.theme = dark ? "dark" : "light"
  const meta = document.querySelector('meta[name="theme-color"]:not([media])')
  if (meta) meta.setAttribute("content", dark ? "#0f1117" : "#3b5bdb")
}

export function ThemeToggle({ className }: { className?: string }) {
  const [choice, setChoice] = useState<Choice>("system")

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved === "light" || saved === "dark" || saved === "system") setChoice(saved)
    } catch {
      // ignore
    }
  }, [])

  // While on "System", follow the phone if the user flips its setting
  useEffect(() => {
    if (choice !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => apply("system")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [choice])

  const pick = (c: Choice) => {
    setChoice(c)
    try {
      localStorage.setItem(KEY, c)
    } catch {
      // ignore
    }
    apply(c)
  }

  const options = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ] as const

  return (
    <div className={cn("grid grid-cols-3 gap-2", className)} role="radiogroup" aria-label="Theme">
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={choice === id}
          onClick={() => pick(id)}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-xl border py-3 text-sm font-medium transition-colors",
            choice === id
              ? "bg-primary text-white border-primary"
              : "bg-card border-border text-foreground"
          )}
        >
          <Icon size={18} />
          {label}
        </button>
      ))}
    </div>
  )
}
