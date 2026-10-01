// PS-13c — « Appareil de confiance » (remplace les passkeys). Après un login mot de passe réussi,
// l'appareil est mémorisé : un jeton aléatoire est posé en cookie httpOnly 1 an, et son HACHÉ
// (SHA-256) est stocké dans public.trusted_devices. Sur un appareil de confiance, /admin entre
// directement — le middleware ré-émet admin_session sans redemander le mot de passe. Révocable
// (« Mes appareils »). Le mot de passe reste le secours.
//
// Tout ici est compatible Edge (Web Crypto, fetch) : utilisé par le middleware ET les routes Node.

export const TRUSTED_COOKIE_NAME = "ps_trusted"
export const TRUSTED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 an (secondes)

export function trustedCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: TRUSTED_COOKIE_MAX_AGE,
  }
}

/** Jeton opaque aléatoire (32 octets → base64url). Posé en clair dans le cookie ; seul son haché est stocké. */
export function generateTrustedToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** SHA-256 hex d'un jeton (ce qui est stocké en base). Edge-safe. */
export async function hashTrustedToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  const bytes = new Uint8Array(digest)
  let hex = ""
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0")
  return hex
}

/** Nom lisible déduit du user-agent (marque/OS · navigateur). Jamais de crash. */
export function deviceLabelFromUA(ua: string | null | undefined): string {
  const s = ua || ""
  let os = "Appareil"
  if (/iPhone|iPad|iPod/i.test(s)) os = "iPhone/iPad"
  else if (/Android/i.test(s)) os = /SM-|Samsung/i.test(s) ? "Samsung" : "Android"
  else if (/Macintosh|Mac OS X/i.test(s)) os = "Mac"
  else if (/Windows/i.test(s)) os = "Windows"
  else if (/Linux/i.test(s)) os = "Linux"

  let browser = ""
  if (/Edg\//i.test(s)) browser = "Edge"
  else if (/OPR\/|Opera/i.test(s)) browser = "Opera"
  else if (/Chrome\//i.test(s) && !/Edg\//i.test(s)) browser = "Chrome"
  else if (/Firefox\//i.test(s)) browser = "Firefox"
  else if (/Safari\//i.test(s)) browser = "Safari"

  return browser ? `${os} · ${browser}` : os
}

// --- Accès REST (service_role) utilisables en Edge (middleware) comme en Node ---

function restBase(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || key === "xxx") return null
  return { url: `${url}/rest/v1/trusted_devices`, key }
}

function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
}

export interface TrustedDeviceRow { id: string; token_hash: string; device_label: string | null }

/**
 * Cherche l'appareil correspondant au jeton (via son haché). Renvoie la ligne ou null.
 * Jeton inconnu/falsifié → null → le middleware/la route retombe sur le mot de passe.
 */
export async function lookupTrustedDevice(token: string | null | undefined): Promise<TrustedDeviceRow | null> {
  if (!token) return null
  const base = restBase()
  if (!base) return null
  const hash = await hashTrustedToken(token)
  try {
    const res = await fetch(`${base.url}?token_hash=eq.${encodeURIComponent(hash)}&select=id,token_hash,device_label&limit=1`, {
      headers: headers(base.key), cache: "no-store",
    })
    if (!res.ok) return null
    const rows = (await res.json()) as TrustedDeviceRow[]
    return Array.isArray(rows) && rows.length === 1 ? rows[0] : null
  } catch { return null }
}

/** Met à jour last_seen_at (best-effort, slow path uniquement). */
export async function touchTrustedDevice(id: string): Promise<void> {
  const base = restBase()
  if (!base) return
  try {
    await fetch(`${base.url}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { ...headers(base.key), Prefer: "return=minimal" },
      body: JSON.stringify({ last_seen_at: new Date().toISOString() }), cache: "no-store",
    })
  } catch { /* non bloquant */ }
}
