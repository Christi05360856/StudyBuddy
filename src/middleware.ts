// PATH: src/middleware.ts
// Runs before every page. Sends logged-out visitors to /login and logged-in visitors away from it.
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

type CookieToSet = {
  name: string
  value: string
  options?: Record<string, unknown>
}

// Pages anyone can open without logging in.
// Admin login uses TOTP (not Supabase). Hire is public marketing.
const PUBLIC_PAGES = [
  "/",
  "/login",
  "/signup",
  "/auth",
  "/privacy",
  "/terms",
  "/hire",
  "/admin/login",
]

// Pages a logged-in student has no reason to see again
const AUTH_ONLY_PAGES = ["/login", "/signup"]

const matches = (path: string, list: string[]) =>
  list.some((p) => (p === "/" ? path === "/" : path === p || path.startsWith(p + "/")))

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const path = request.nextUrl.pathname

  // Admin app (except login) is gated by TOTP cookie in its own layout — skip student auth
  if (path.startsWith("/admin") && path !== "/admin/login" && !path.startsWith("/admin/login/")) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as any)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // API routes check the user themselves and answer with a JSON error (not a redirect)
  if (path.startsWith("/api/")) {
    return supabaseResponse
  }

  if (!user && !matches(path, PUBLIC_PAGES)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`
    return NextResponse.redirect(url)
  }

  if (user && matches(path, AUTH_ONLY_PAGES)) {
    const url = request.nextUrl.clone()
    url.pathname = "/home"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|offline.html|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
