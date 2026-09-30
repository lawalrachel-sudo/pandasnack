// PS-11 — Session admin : UNE seule logique de signature/validation, compatible Edge
// (middleware) ET Node (route handlers, server components). Web Crypto (HMAC-SHA256) produit
// des octets identiques à node:crypto → les cookies restent interchangeables.
//
// Bug corrigé : le cookie n'était posé que via fetch() (login/renew XHR). Safari (ITP) plafonne
// à 7 jours la durée des cookies posés hors navigation → déconnexion admin hebdomadaire. On
// renouvelle désormais le cookie au fil des NAVIGATIONS /admin/* (middleware), non plafonné.

export const ADMIN_COOKIE_NAME = "admin_session"
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 90 // 90 jours (secondes)

export function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  }
}

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function hmacB64(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
  return b64url(sig)
}

/** Valeur signée « admin.<expEpochSec>.<hmac> », valable 90 jours. */
export async function signAdminSession(secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_COOKIE_MAX_AGE
  const payload = `admin.${exp}`
  return `${payload}.${await hmacB64(secret, payload)}`
}

/** Valide une valeur de cookie admin (signature + expiration). Comparaison en temps constant. */
export async function verifyAdminSession(value: string | null | undefined, secret: string | null | undefined): Promise<boolean> {
  if (!value || !secret) return false
  const lastDot = value.lastIndexOf(".")
  if (lastDot <= 0) return false
  const payload = value.slice(0, lastDot)
  const sig = value.slice(lastDot + 1)

  let expected: string
  try { expected = await hmacB64(secret, payload) } catch { return false }
  if (sig.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) return false

  const [tag, expStr] = payload.split(".")
  if (tag !== "admin") return false
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  return true
}
