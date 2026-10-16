import { timingSafeEqual } from "crypto"

// PS-23b — Garde Bearer pour les routes EXONA (/api/pont/courses). Compare l'en-tête
// « Authorization: Bearer <token> » au secret PANDA_SNACK_PONT_SECRET en temps constant.
export function checkPontBearer(authorization: string | null): boolean {
  const secret = process.env.PANDA_SNACK_PONT_SECRET
  if (!secret) return false
  const token = (authorization || "").startsWith("Bearer ") ? (authorization || "").slice(7) : ""
  const a = Buffer.from(token), b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}
