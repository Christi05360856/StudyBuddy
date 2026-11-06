// PATH: src/app/auth/callback/route.ts

import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  // Only allow going to a page inside our own app
  const rawNext = searchParams.get("next") ?? "/home"
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/home"

  // Behind Vercel the real site address is in x-forwarded-host
  const forwardedHost = request.headers.get("x-forwarded-host")
  const isLocal = process.env.NODE_ENV === "development"
  const base = !isLocal && forwardedHost ? `https://${forwardedHost}` : origin

  if (!code) return NextResponse.redirect(`${base}/login?error=google`)

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${base}/login?error=google`)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login?error=google`)

  const { data: profile } = await supabase
    .from("profiles")
    .select("institution, department, level")
    .eq("id", user.id)
    .maybeSingle()

  const complete = Boolean(profile?.institution && profile?.department && profile?.level)
  const target = complete ? next : `/onboarding?next=${encodeURIComponent(next)}`
  return NextResponse.redirect(`${base}${target}`)
}
