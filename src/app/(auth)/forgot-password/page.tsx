// PATH: src/app/(auth)/forgot-password/page.tsx
"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { MailCheck } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthShell } from "@/components/auth-shell"

const labelClass = "block text-sm font-medium text-foreground mb-1"

// How long a student must wait before asking for another email
const COOLDOWN_SECONDS = 60

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const linkExpired = searchParams.get("error") === "expired"

  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  // Counts down the "send again" timer
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const sendLink = async () => {
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` }
    )

    setLoading(false)

    if (resetError) {
      const msg = resetError.message.toLowerCase()
      if (resetError.status === 429 || msg.includes("rate limit") || msg.includes("seconds")) {
        setError("Too many requests. Please wait a minute and try again.")
      } else {
        setError("We could not send the email. Check your internet and try again.")
      }
      return
    }

    setSent(true)
    setCooldown(COOLDOWN_SECONDS)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendLink()
  }

  return (
    <AuthShell
      active="login"
      headline="Forgot your password? It happens to everyone."
      subtext="We will send a link to your email so you can choose a new one."
      heading={sent ? "Check your email" : "Reset your password"}
    >
      {sent ? (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-2xl bg-card border border-border p-4">
            <span className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
              <MailCheck size={20} className="text-primary" />
            </span>
            <p className="text-sm text-gray-600 leading-relaxed">
              If an account exists for <span className="font-medium text-foreground">{email.trim()}</span>,
              a reset link is on its way. It can take a minute. Also check your spam or junk folder.
            </p>
          </div>

          <Button
            variant="outline"
            className="w-full"
            size="lg"
            disabled={loading || cooldown > 0}
            onClick={sendLink}
          >
            {loading ? "Sending..." : cooldown > 0 ? `Send again in ${cooldown}s` : "Send the email again"}
          </Button>

          {error && (
            <p role="alert" className="text-sm text-danger bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <p className="text-center text-sm text-gray-500">
            <Link href="/login" className="text-primary font-medium">
              Back to log in
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {linkExpired && (
            <p role="alert" className="text-sm text-amber-800 bg-accent-soft px-3 py-2 rounded-lg">
              That link has expired or was already used. Enter your email to get a new one.
            </p>
          )}

          <div>
            <label htmlFor="email" className={labelClass}>Email address</label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              required
              autoComplete="email"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Sending..." : "Send reset link"}
          </Button>

          <p className="text-center text-sm text-gray-500">
            Remembered it?{" "}
            <Link href="/login" className="text-primary font-medium">
              Log in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  )
}
