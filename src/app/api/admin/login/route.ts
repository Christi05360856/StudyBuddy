// PATH: src/app/api/admin/login/route.ts
import { NextRequest, NextResponse } from "next/server"
import { verifyTotp } from "@/lib/admin/totp"
import { ADMIN_COOKIE, createAdminToken, MAX_AGE_SEC } from "@/lib/admin/session"

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.ADMIN_TOTP_SECRET
    if (!secret) {
      return NextResponse.json(
        { error: "Admin login is not configured (ADMIN_TOTP_SECRET)." },
        { status: 503 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const code = String(body.code ?? "").replace(/\D/g, "")
    if (code.length !== 6) {
      return NextResponse.json({ error: "Enter the 6-digit code from Google Authenticator." }, { status: 400 })
    }

    if (!verifyTotp(secret, code)) {
      return NextResponse.json({ error: "Wrong or expired code. Try the next one." }, { status: 401 })
    }

    const token = createAdminToken()
    const res = NextResponse.json({ ok: true })
    res.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SEC,
    })
    return res
  } catch (err) {
    console.error("admin login:", err)
    return NextResponse.json({ error: "Could not sign in." }, { status: 500 })
  }
}
