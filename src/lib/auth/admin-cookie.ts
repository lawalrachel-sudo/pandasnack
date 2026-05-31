import crypto from "node:crypto"
import { cookies } from "next/headers"

// Accès admin par mot de passe (indépendant du système de comptes Supabase).
// Cookie signé HMAC-SHA256, httpOnly, 30 jours. Le secret vit dans l'env var
// Vercel ADMIN_COOKIE_SECRET (jamais commité). Tourne en runtime Node (route
// handlers + server components) — PAS en middleware Edge, donc node:crypto OK.

export const ADMIN_COOKIE_NAME = "admin_session"
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 jours en secondes

function getSecret(): string {
  const secret = process.env.ADMIN_COOKIE_SECRET
  if (!secret) throw new Error("ADMIN_COOKIE_SECRET manquant (env var Vercel)")
  return secret
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url")
}

// Valeur du cookie : "admin.<expEpochSec>.<hmacBase64url>"
export function createAdminSessionValue(): string {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_COOKIE_MAX_AGE
  const payload = `admin.${exp}`
  return `${payload}.${sign(payload)}`
}

export function verifyAdminSessionValue(value: string | undefined | null): boolean {
  if (!value) return false
  const lastDot = value.lastIndexOf(".")
  if (lastDot <= 0) return false
  const payload = value.slice(0, lastDot)
  const sig = value.slice(lastDot + 1)

  let expected: string
  try {
    expected = sign(payload)
  } catch {
    return false // secret manquant → on refuse plutôt que crasher
  }

  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length) return false
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false

  const [tag, expStr] = payload.split(".")
  if (tag !== "admin") return false
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  return true
}

// Lecture depuis le cookie store — utilisable en server component ET route handler.
export async function hasValidAdminCookie(): Promise<boolean> {
  const store = await cookies()
  return verifyAdminSessionValue(store.get(ADMIN_COOKIE_NAME)?.value)
}

// Comparaison constante du mot de passe (évite la fuite par timing/longueur).
export function passwordMatches(received: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(received).digest()
  const b = crypto.createHash("sha256").update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}
