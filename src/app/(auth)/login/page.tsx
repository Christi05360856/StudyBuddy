// PATH: src/app/(auth)/login/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { AuthShell } from "@/components/auth-shell"

const labelClass = "block text-sm font-medium text-foreground mb-1"

// Only allow going to a page inside our own app (stops "log in then jump to another website" tricks)
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/home"
}

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [resending, setResending] = useState(false)
  const [next, setNext] = useState("/home")

  // Read ?next=... and ?error=link from the address bar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setNext(safeNext(params.get("next")))
    if (params.get("error") === "link") {
      setError("That confirmation link has expired or was already used. Log in below and we can send a new one.")
    }
  }, [])

  const [form, setForm] = useState({
    email: "",
    password: "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setUnconfirmed(false)
    setLoading(true)

    const supabase = createClient()

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      })

      if (authError) {
        // Tell the student when the real problem is an unconfirmed email
        if (authError.message.toLowerCase().includes("not confirmed")) {
          setUnconfirmed(true)
          throw new Error("Please confirm your email first. Open the link we sent to your inbox (check spam too).")
        }
        if (authError.status === 429 || authError.message.toLowerCase().includes("rate limit")) {
          throw new Error("Too many attempts. Please wait a few minutes and try again.")
        }
        throw new Error("Invalid email or password")
      }

      // Every account must have a profile (name, school, matric number).
      // Accounts from a sign up that stopped half way may be missing it, so we repair it here.
      const user = data.user
      const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle()

      if (!profile) {
        const meta = user.user_metadata ?? {}
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: user.id,
          full_name: meta.full_name ?? "",
          matric_number: meta.matric_number ?? "",
          institution: meta.institution ?? "",
          department: meta.department ?? null,
          level: meta.level ?? null,
          role: "student",
        })

        if (profileError) {
          await supabase.auth.signOut()
          throw new Error(
            profileError.code === "23505"
              ? "This matric number is already registered to another account."
              : "We could not finish setting up your account. Please try again."
          )
        }
      }

      router.push(next)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  const resendConfirmation = async () => {
    setResending(true)
    setError(null)
    const supabase = createClient()
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: form.email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/home` },
    })
    setResending(false)
    if (resendError) {
      setError("Could not send the email right now. Please wait a few minutes and try again.")
    } else {
      setNotice("Done. A new confirmation link is on its way.")
    }
  }

  return (
    <AuthShell
      active="login"
      headline="Welcome back. Pick up where you stopped."
      subtext="Your notes, quizzes and tutor are waiting."
      heading="Log in to your account"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className={labelClass}>Email address</label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={handleChange}
            required
            autoComplete="email"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              Password
            </label>
            <Link href="/forgot-password" className="text-sm text-primary font-medium">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            placeholder="Your password"
            value={form.password}
            onChange={handleChange}
            required
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger bg-red-50 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        {notice && (
          <p role="status" className="text-sm text-success bg-green-50 px-3 py-2 rounded-lg">
            {notice}
          </p>
        )}

        {unconfirmed && (
          <Button type="button" variant="outline" className="w-full" disabled={resending} onClick={resendConfirmation}>
            {resending ? "Sending..." : "Resend confirmation email"}
          </Button>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "Signing in..." : "Log in"}
        </Button>
      </form>
    </AuthShell>
  )
}
