// PATH: src/app/(auth)/reset-password/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { AuthShell } from "@/components/auth-shell"

const labelClass = "block text-sm font-medium text-foreground mb-1"

export default function ResetPasswordPage() {
  const router = useRouter()

  // "checking" while we look for the reset session, then "ready" or "invalid"
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The email link signs the student in for a short time. No session means the link did not work.
  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setState(user ? "ready" : "invalid")
    }
    check()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    if (password !== confirm) {
      setError("The two passwords do not match")
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      const msg = updateError.message.toLowerCase()
      if (msg.includes("different from the old")) {
        setError("Please choose a password you have not used before.")
      } else if (msg.includes("session") || msg.includes("not authenticated")) {
        setState("invalid")
      } else {
        setError("Could not change your password. Please try again.")
      }
      return
    }

    router.push("/home")
    router.refresh()
  }

  return (
    <AuthShell
      active="login"
      headline="Almost done. Choose a new password."
      subtext="Pick something you will remember, at least 8 characters."
      heading="Choose a new password"
    >
      {state === "checking" && (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      )}

      {state === "invalid" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            This reset link has expired, was already used, or was opened in a different app. Please
            ask for a new one.
          </p>
          <Link href="/forgot-password">
            <Button className="w-full" size="lg">
              Get a new link
            </Button>
          </Link>
        </div>
      )}

      {state === "ready" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className={labelClass}>New password</label>
            <PasswordInput
              id="password"
              name="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              required
              autoComplete="new-password"
            />
          </div>

          <div>
            <label htmlFor="confirm" className={labelClass}>Confirm new password</label>
            <PasswordInput
              id="confirm"
              name="confirm"
              placeholder="Type it again"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                setError(null)
              }}
              required
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Saving..." : "Save new password"}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
