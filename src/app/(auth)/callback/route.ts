// PATH: src/app/auth/callback/route.ts
// The page a student lands on when they tap a link in an email from us:
//  - "confirm your email" after sign up  (goes on to /home)
//  - "reset your password"               (goes on to /reset-password)
// It turns the link into a real login session. It understands both kinds of email link
// Supabase can send (see the setup notes).
//
// IMPORTANT: this file must live at src/app/auth/callback/route.ts so the address is /auth/callback.

import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  // Only allow going to a page inside our own app
  const rawNext = searchParams.get("next") ?? "/reset-password"
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/reset-password"

  const supabase = await createClient()
  let ok = false

  if (tokenHash && type) {
    // Works even if the link is opened in a different browser from where it was requested
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    ok = !error
  } else if (code) {
    // Works only in the same browser that asked for the reset
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    ok = !error
  }

  if (ok) return NextResponse.redirect(`${origin}${next}`)

  // An old or already-used link. Confirmation links go back to log in, reset links to "forgot password".
  const isConfirmation = type === "signup" || type === "email" || next === "/home"
  return NextResponse.redirect(
    isConfirmation ? `${origin}/login?error=link` : `${origin}/forgot-password?error=expired`
  )
}
