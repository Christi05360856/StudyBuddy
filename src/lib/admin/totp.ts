// PATH: src/lib/admin/totp.ts
/**
 * Google Authenticator–compatible TOTP (RFC 6238).
 * No extra npm packages — uses Node crypto only.
 */
import { createHmac, timingSafeEqual } from "crypto"

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function base32Decode(secret: string): Buffer {
  const cleaned = secret.replace(/\s+/g, "").replace(/=+$/, "").toUpperCase()
  let bits = ""
  for (const ch of cleaned) {
    const val = BASE32_ALPHABET.indexOf(ch)
    if (val < 0) continue
    bits += val.toString(2).padStart(5, "0")
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2))
  }
  return Buffer.from(bytes)
}

function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac("sha1", key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(code % 1_000_000).padStart(6, "0")
}

/** Verify a 6-digit code. Allows ±1 step (30s) for clock skew. */
export function verifyTotp(secretBase32: string, token: string, window = 1): boolean {
  const cleaned = String(token).replace(/\D/g, "")
  if (cleaned.length !== 6) return false
  if (!secretBase32 || secretBase32.length < 16) return false

  let key: Buffer
  try {
    key = base32Decode(secretBase32)
  } catch {
    return false
  }
  if (key.length < 10) return false

  const step = 30
  const counter = Math.floor(Date.now() / 1000 / step)
  const expected = Buffer.from(cleaned)

  for (let w = -window; w <= window; w++) {
    const code = Buffer.from(hotp(key, counter + w))
    if (code.length === expected.length && timingSafeEqual(code, expected)) {
      return true
    }
  }
  return false
}
