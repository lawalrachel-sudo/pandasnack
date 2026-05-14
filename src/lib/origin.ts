// P0 #4 — origin whitelist : empêche un attaquant de spoofer le Host header pour
// rediriger l'utilisateur vers son propre site après checkout Stripe (open redirect).
// Configurable via env ALLOWED_ORIGINS (CSV) en cas de domaine custom additionnel.
const DEFAULT_ALLOWED = [
  "https://pandasnack.online",
  "https://pandasnack-five.vercel.app",
]
const FALLBACK = "https://pandasnack.online"

export function resolveOrigin(reqOrigin: string | null): string {
  const allowed = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean)
    : DEFAULT_ALLOWED
  if (reqOrigin && allowed.includes(reqOrigin)) return reqOrigin
  return FALLBACK
}
