// PATH: src/lib/ai/secret-box.ts
// Hides the tutor's answer key from the browser.
// The expected answer is stored encrypted (AES-256-GCM) in the student's own session row, which the
// student's app can read, so without this a curious student could read the answers.
// Key: TUTOR_SECRET if set, otherwise the Supabase service key (server only). With neither,
// the value is stored as before (readable) and a warning is logged.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

function key(): Buffer | null {
  const secret = process.env.TUTOR_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (!secret) return null
  return createHash("sha256").update(`studybuddy-tutor-v1:${secret}`).digest()
}

const PREFIX = "enc1:"

export function sealSecret(plain: string | null | undefined): string | null {
  if (!plain) return null
  const k = key()
  if (!k) {
    console.warn("TUTOR_SECRET not set: tutor answer keys are stored readable.")
    return plain
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", k, iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64")
}

export function openSecret(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!stored.startsWith(PREFIX)) return stored // older rows were stored readable
  const k = key()
  if (!k) return null
  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), "base64")
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const data = buf.subarray(28)
    const decipher = createDecipheriv("aes-256-gcm", k, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}
