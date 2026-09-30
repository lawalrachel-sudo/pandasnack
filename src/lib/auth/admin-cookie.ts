import crypto from "node:crypto"
import { cookies } from "next/headers"
import {
  ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE, adminCookieOptions,
  signAdminSession, verifyAdminSession,
} from "./admin-session"

// PS-11 — la logique de signature/validation vit dans admin-session.ts (Edge-safe, partagée
// avec le middleware). Ici : les accès Node (cookie store, mot de passe).
export { ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE, adminCookieOptions }

function getSecret(): string {
  const secret = process.env.ADMIN_COOKIE_SECRET
  if (!secret) throw new Error("ADMIN_COOKIE_SECRET manquant (env var Vercel)")
  return secret
}

/** Valeur de cookie signée (90 j). Async : utilise la même primitive que le middleware. */
export function createAdminSessionValue(): Promise<string> {
  return signAdminSession(getSecret())
}

/** Validation partagée (même fonction que le middleware). */
export function verifyAdminSessionValue(value: string | undefined | null): Promise<boolean> {
  return verifyAdminSession(value, process.env.ADMIN_COOKIE_SECRET)
}

// Lecture depuis le cookie store — server component ET route handler.
export async function hasValidAdminCookie(): Promise<boolean> {
  const store = await cookies()
  return verifyAdminSession(store.get(ADMIN_COOKIE_NAME)?.value, process.env.ADMIN_COOKIE_SECRET)
}

// Comparaison constante du mot de passe (évite la fuite par timing/longueur).
export function passwordMatches(received: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(received).digest()
  const b = crypto.createHash("sha256").update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}
