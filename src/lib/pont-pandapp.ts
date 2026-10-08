// PS-15 — Pont PandApp → Panda Snack : vérification du jeton signé (réception uniquement).
//
// Contrat (source de vérité : pandattitude-3d/src/lib/pandaSnack.ts, fonction verifierJetonPont,
// EN PROD depuis le 08/10) — transposé ici à l'identique, Web Crypto (Edge + Node) :
//   jeton = base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, corps))
//   corps = base64url(JSON payload) (le 1er segment). Pas de préfixe de version.
//   Signature comparée à temps constant. Le rejeu (jti) est contrôlé côté base (route).

export interface PontEnfant { prenom: string; nom: string }
export interface PontPayload {
  email: string
  familleId: string
  enfants: PontEnfant[]
  tags: string[]
  exp: number // epoch secondes (émis à +60 s)
  jti: string // usage unique
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
}
function bytesFromB64url(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4))
  const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacB64url(secret: string, corps: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(corps))
  return b64urlFromBytes(new Uint8Array(sig))
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Fabrique un jeton signé (payload exp/jti fournis) — référence / vecteurs de test. */
export async function buildPontToken(secret: string, payload: PontPayload): Promise<string> {
  const corps = b64urlFromBytes(new TextEncoder().encode(JSON.stringify(payload)))
  return corps + "." + (await hmacB64url(secret, corps))
}

export type PontVerifyResult =
  | { ok: true; payload: PontPayload }
  | { ok: false; reason: "format" | "signature" | "expired" | "payload" }

/**
 * Vérifie un jeton : signature (temps constant) sur le corps reçu, puis expiration (exp >= now).
 * `now` en secondes epoch. Transposition fidèle de verifierJetonPont. Le jti est contrôlé ailleurs.
 */
export async function verifyPontToken(
  token: string | null | undefined,
  secret: string | null | undefined,
  now: number = Math.floor(Date.now() / 1000),
): Promise<PontVerifyResult> {
  if (!token || !secret) return { ok: false, reason: "format" }
  const dot = token.indexOf(".")
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: "format" }
  const corps = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  let expected: string
  try { expected = await hmacB64url(secret, corps) } catch { return { ok: false, reason: "signature" } }
  if (!constantTimeEqual(sig, expected)) return { ok: false, reason: "signature" }

  let payload: PontPayload
  try { payload = JSON.parse(new TextDecoder().decode(bytesFromB64url(corps))) as PontPayload } catch { return { ok: false, reason: "payload" } }

  if (!payload || typeof payload.exp !== "number" || !payload.email || !payload.familleId || !payload.jti) {
    return { ok: false, reason: "payload" }
  }
  if (payload.exp < now) return { ok: false, reason: "expired" }
  return { ok: true, payload }
}

// ── Résolution de compte (pur, testable) ────────────────────────────────────

export interface PontAccount { id: string; email: string | null; pandapp_famille_id: string | null; archived_at?: string | null }

/**
 * Choisit le compte Snack : d'abord le lien famille (pandapp_famille_id), sinon l'e-mail du
 * payload. Plusieurs comptes distincts → on garde celui de l'e-mail du payload, rien n'est fusionné,
 * et conflict = true.
 */
export function pickPontAccount(
  byFamille: PontAccount | null,
  byEmail: PontAccount[],
): { account: PontAccount | null; conflict: boolean; action: "matched" | "conflict" | "none" } {
  const distinct = new Map<string, PontAccount>()
  if (byFamille) distinct.set(byFamille.id, byFamille)
  for (const a of byEmail || []) distinct.set(a.id, a)

  const chosen = byFamille || (byEmail || [])[0] || null
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
    out.push({ prenom: e.prenom.trim(), nom: e.nom.trim() })
  }
  return out
}
