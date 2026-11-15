// PATH: src/lib/admin/session.ts
import { createHmac, timingSafeEqual, randomBytes } from "crypto"
import { cookies } from "next/headers"

export const ADMIN_COOKIE = "sb_admin_session"
const MAX_AGE_SEC = 60 * 60 * 12 // 12 hours

function sessionSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET
  if (!s || s.length < 16) {
    throw new Error("ADMIN_SESSION_SECRET is missing or too short (min 16 chars)")
  }
  return s
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url")
}

/** Create a signed session token: exp.nonce.sig */
export function createAdminToken(): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC
  const nonce = randomBytes(16).toString("base64url")
  const payload = `${exp}.${nonce}`
  return `${payload}.${sign(payload)}`
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token) return false
  const parts = token.split(".")
  if (parts.length !== 3) return false
  const [expStr, nonce, sig] = parts
  const payload = `${expStr}.${nonce}`
  let expected: string
  try {
    expected = sign(payload)
  } catch {
    return false
  }
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  } catch {
    return false
  }
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  return true
}

export async function isAdminRequest(): Promise<boolean> {
  try {
    const jar = await cookies()
    return verifyAdminToken(jar.get(ADMIN_COOKIE)?.value)
  } catch {
    return false
  }
}

export { MAX_AGE_SEC }
