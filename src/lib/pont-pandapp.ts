// PS-15 — Pont PandApp → Panda Snack : vérification du jeton signé (réception uniquement).
//
// Format du jeton (contrat figé, voir docs/PONT_PANDAPP.md) :
//   "v1." + base64url(payload) + "." + base64url(HMAC-SHA256(secret, "v1." + base64url(payload)))
//
// La vérification porte sur la CHAÎNE reçue (signing input = "v1." + base64url(payload) littéral),
// jamais sur une re-sérialisation : PandApp et Snack n'ont pas à canoniser le JSON à l'identique.
// Web Crypto (HMAC-SHA256) → compatible Edge et Node. Logique pure, testable ; le nonce (anti-rejeu)
// est vérifié côté route (base), pas ici.

export interface PontEnfant { profil_id: string; prenom: string; nom: string }
export interface PontPayload {
  v: number
  famille_id: string
  email_titulaire: string
  email_parent2: string | null
  email_connecte: string
  enfants: PontEnfant[]
  iat: number
  exp: number
  nonce: string
}

export const PONT_IAT_TOLERANCE_SEC = 60
export const PONT_TTL_SEC = 300

function b64urlFromBytes(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
function bytesFromB64url(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4))
  const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
export function b64urlEncodeString(s: string): string {
  return b64urlFromBytes(new TextEncoder().encode(s))
}
export function b64urlDecodeToString(s: string): string {
  return new TextDecoder().decode(bytesFromB64url(s))
}

async function hmacB64url(secret: string, signingInput: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput))
  return b64urlFromBytes(new Uint8Array(sig))
}

// Comparaison à temps constant (longueur + XOR).
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Sérialisation canonique du payload (ordre de clés figé) → utilisée pour FABRIQUER un jeton
 * (vecteur de test, référence PandApp). La vérification n'en dépend pas.
 */
export function canonicalPayloadJSON(p: PontPayload): string {
  return JSON.stringify({
    v: p.v,
    famille_id: p.famille_id,
    email_titulaire: p.email_titulaire,
    email_parent2: p.email_parent2,
    email_connecte: p.email_connecte,
    enfants: p.enfants.map((e) => ({ profil_id: e.profil_id, prenom: e.prenom, nom: e.nom })),
    iat: p.iat,
    exp: p.exp,
    nonce: p.nonce,
  })
}

/** Fabrique un jeton signé à partir d'un payload (référence PandApp / vecteurs de test). */
export async function buildPontToken(secret: string, payload: PontPayload): Promise<string> {
  const signingInput = "v1." + b64urlEncodeString(canonicalPayloadJSON(payload))
  return signingInput + "." + (await hmacB64url(secret, signingInput))
}

export type PontVerifyResult =
  | { ok: true; payload: PontPayload }
  | { ok: false; reason: "format" | "signature" | "version" | "expired" | "iat_future" | "payload" }

/**
 * Vérifie un jeton : signature (temps constant), v=1, exp > now, iat pas dans le futur (tol. 60 s).
 * `now` en secondes epoch. Le nonce est vérifié ailleurs (base).
 */
export async function verifyPontToken(
  token: string | null | undefined,
  secret: string | null | undefined,
  now: number = Math.floor(Date.now() / 1000),
): Promise<PontVerifyResult> {
  if (!token || !secret) return { ok: false, reason: "format" }
  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) return { ok: false, reason: "format" }

  const signingInput = "v1." + parts[1]
  let expected: string
  try { expected = await hmacB64url(secret, signingInput) } catch { return { ok: false, reason: "signature" } }
  if (!constantTimeEqual(parts[2], expected)) return { ok: false, reason: "signature" }

  let payload: PontPayload
  try { payload = JSON.parse(b64urlDecodeToString(parts[1])) as PontPayload } catch { return { ok: false, reason: "payload" } }

  if (payload?.v !== 1) return { ok: false, reason: "version" }
  if (typeof payload.exp !== "number" || typeof payload.iat !== "number") return { ok: false, reason: "payload" }
  if (!payload.famille_id || !payload.email_titulaire || !payload.nonce) return { ok: false, reason: "payload" }
  if (now > payload.exp) return { ok: false, reason: "expired" }
  if (payload.iat > now + PONT_IAT_TOLERANCE_SEC) return { ok: false, reason: "iat_future" }

  return { ok: true, payload }
}

// ── Résolution de compte (pur, testable) ────────────────────────────────────

export interface PontAccount { id: string; email: string | null; pandapp_famille_id: string | null; archived_at?: string | null }

/**
 * Choisit le compte Snack d'après l'ordre de priorité : pandapp_famille_id, puis e-mail
 * titulaire, puis e-mail parent 2. Plusieurs comptes distincts trouvés → on garde celui du
 * titulaire (ou le lien famille s'il existe), rien n'est fusionné, et conflict = true.
 */
export function pickPontAccount(
  byFamille: PontAccount | null,
  byTitulaire: PontAccount[],
  byParent2: PontAccount[],
): { account: PontAccount | null; conflict: boolean; action: "matched" | "conflict" | "none" } {
  const distinct = new Map<string, PontAccount>()
  if (byFamille) distinct.set(byFamille.id, byFamille)
  for (const a of byTitulaire || []) distinct.set(a.id, a)
  for (const a of byParent2 || []) distinct.set(a.id, a)

  const chosen = byFamille || (byTitulaire || [])[0] || (byParent2 || [])[0] || null
  if (!chosen) return { account: null, conflict: false, action: "none" }
  const conflict = distinct.size > 1
  return { account: chosen, conflict, action: conflict ? "conflict" : "matched" }
}

function normName(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase()
}

/**
 * Parmi les enfants transmis, ceux à CRÉER sur le compte : absents des profils existants
 * (comparaison prénom+nom insensible à la casse/espaces). Ne modifie jamais un profil existant.
 */
export function childrenToCreate(
  existingProfils: Array<{ prenom?: string | null; nom?: string | null }>,
  enfants: PontEnfant[],
): PontEnfant[] {
  const seen = new Set((existingProfils || []).map((p) => normName(p.prenom) + "\u0000" + normName(p.nom)))
  const out: PontEnfant[] = []
  const added = new Set<string>()
  for (const e of enfants || []) {
    if (!e?.prenom || !e?.nom) continue
    const key = normName(e.prenom) + "\u0000" + normName(e.nom)
    if (seen.has(key) || added.has(key)) continue
    added.add(key)
    out.push({ profil_id: e.profil_id, prenom: e.prenom.trim(), nom: e.nom.trim() })
  }
  return out
}
