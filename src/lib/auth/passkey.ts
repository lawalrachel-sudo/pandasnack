// PS-13c — Connexion admin par empreinte / visage (WebAuthn / passkeys).
//
// Un seul « utilisateur admin » logique (le détenteur du mot de passe). Chaque passkey
// enregistrée = un appareil (téléphone, Mac…), stocké dans public.admin_passkeys (service_role).
// Une passkey vérifiée pose le MÊME cookie admin_session 90 j que le mot de passe.
//
// Ce module ne contient que des helpers PURS (config RP, (dé)sérialisation, sélection de
// credential) — testables sans navigateur. Les appels @simplewebauthn/server vivent dans les
// routes /api/admin/passkey/*.

// Identité admin unique : un handle fixe regroupe tous les appareils sous le même « compte ».
export const ADMIN_PASSKEY_USER_ID = "panda-admin"
export const ADMIN_PASSKEY_USER_NAME = "admin"
export const ADMIN_PASSKEY_USER_DISPLAY = "Admin Panda Snack"

// Cookie httpOnly court qui mémorise le challenge entre /options et /verify.
export const PASSKEY_CHALLENGE_COOKIE = "ps_pk_chal"
export const PASSKEY_CHALLENGE_MAX_AGE = 5 * 60 // 5 minutes

export function passkeyChallengeCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: PASSKEY_CHALLENGE_MAX_AGE,
  }
}

export interface RpConfig {
  rpID: string      // domaine (eTLD+1 ou host), ex. "pandasnack.online" ou "localhost"
  origin: string    // origine complète, ex. "https://pandasnack.online"
  rpName: string
}

export const RP_NAME = "Panda Snack Admin"

/**
 * Déduit la config RP (rpID + origin) depuis l'en-tête Host de la requête. rpID = hostname sans
 * port (WebAuthn l'exige) ; origin = scheme://host. En prod le scheme est https ; en localhost on
 * reste en http. Robuste aux valeurs vides.
 */
export function rpConfigFromHost(host: string | null | undefined): RpConfig {
  const h = (host || "localhost").trim()
  const hostname = h.split(":")[0] || "localhost"
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost")
  const scheme = isLocal ? "http" : "https"
  return { rpID: hostname, origin: `${scheme}://${h}`, rpName: RP_NAME }
}

export interface StoredPasskey {
  credential_id: string
  public_key: string
  counter: number
  transports?: string[] | null
}

/**
 * Sélectionne la credential correspondant à l'ID renvoyé par l'authentificateur. Renvoie null si
 * aucune ne correspond → la route DOIT refuser (credential inconnue). Pur, testable.
 */
export function pickCredential<T extends { credential_id: string }>(
  credentialIdB64url: string | null | undefined,
  rows: T[] | null | undefined,
): T | null {
  if (!credentialIdB64url || !rows) return null
  return rows.find((r) => r.credential_id === credentialIdB64url) || null
}

// (dé)sérialisation base64url ⇄ Uint8Array (clé publique COSE stockée en texte dans la DB).
export function toB64url(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function fromB64url(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4))
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
