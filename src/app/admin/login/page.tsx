// PATH: src/app/admin/login/page.tsx
"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Shield } from "lucide-react"

export default function AdminLoginPage() {
  const router = useRouter()
  const [digits, setDigits] = useState(["", "", "", "", "", ""])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputs.current[0]?.focus()
  }, [])

  const setDigit = (index: number, value: string) => {
    const v = value.replace(/\D/g, "").slice(-1)
    const next = [...digits]
    next[index] = v
    setDigits(next)
    setError(null)
    if (v && index < 5) inputs.current[index + 1]?.focus()
    if (v && index === 5 && next.every((d) => d)) {
      void submit(next.join(""))
    }
  }

  const onKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (!pasted) return
    const next = [...digits]
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? ""
    setDigits(next)
    if (pasted.length === 6) void submit(pasted)
    else inputs.current[Math.min(pasted.length, 5)]?.focus()
  }

  const submit = async (code: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "Could not sign in")
        setDigits(["", "", "", "", "", ""])
        inputs.current[0]?.focus()
        return
      }
      router.replace("/admin")
      router.refresh()
    } catch {
      setError("Network error. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-4">
            <Shield size={28} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
          <p className="text-sm text-gray-500 mt-2">
            Open Google Authenticator and enter the 6-digit code.
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex justify-between gap-2 mb-4" onPaste={onPaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={d}
                disabled={loading}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                className="w-11 h-14 text-center text-xl font-semibold rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              />
            ))}
          </div>

          {error && (
            <p className="text-sm text-danger text-center mb-3">{error}</p>
          )}

          <button
            type="button"
            disabled={loading || digits.some((d) => !d)}
            onClick={() => void submit(digits.join(""))}
            className="w-full h-12 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : "Unlock"}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Session lasts 12 hours · StudyBuddy NG
        </p>
      </div>
    </div>
  )
}
