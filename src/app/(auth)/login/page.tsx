// PATH: src/app/(auth)/login/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/components/auth-shell"
import Link from "next/link"

// Only allow going to a page inside our own app (stops "log in then jump to another website" tricks)
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/home"
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [next, setNext] = useState("/home")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setNext(safeNext(params.get("next")))
    if (params.get("error")) {
      setError("We could not sign you in with Google. Please try again.")
    }
  }, [])

  const continueWithGoogle = async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Always let the student pick the account (many share phones)
        queryParams: { prompt: "select_account" },
      },
    })
    // On success the browser leaves this page, so we only handle the failure case
    if (oauthError) {
      setError("Could not reach Google right now. Please try again.")
      setLoading(false)
    }
  }

  return (
    <AuthShell
      headline="Turn your class notes into practice questions."
      subtext="Upload a lecture PDF. Get a timed quiz and a tutor that explains in simple words."
      heading="Welcome to StudyBuddy"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          One tap with your Google account. No password to remember, no code to wait for.
        </p>

        {error && (
          <p role="alert" className="text-sm text-danger bg-red-50 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full gap-3"
          disabled={loading}
          onClick={continueWithGoogle}
        >
          <GoogleLogo />
          {loading ? "Opening Google..." : "Continue with Google"}
        </Button>

        <p className="text-xs text-gray-400 text-center">
          New here? Same button. We will ask for your school details right after.
        </p>
                <p className="text-xs text-gray-400 text-center">
          By continuing you agree to our{" "}
          <Link href="/terms" className="underline">Terms</Link> and{" "}
          <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </div>
    </AuthShell>
  )
}
