import { NextRequest, NextResponse } from "next/server"
import { cookies, headers } from "next/headers"
import { verifyAuthenticationResponse, type AuthenticatorTransportFuture } from "@simplewebauthn/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import {
  ADMIN_COOKIE_NAME, adminCookieOptions, createAdminSessionValue,
} from "@/lib/auth/admin-cookie"
import {
  rpConfigFromHost, PASSKEY_CHALLENGE_COOKIE, passkeyChallengeCookieOptions,
  pickCredential, fromB64url, type StoredPasskey,
} from "@/lib/auth/passkey"

export const dynamic = "force-dynamic"

// POST /api/admin/passkey/login/verify — PUBLIC. Vérifie l'assertion ; si une credential CONNUE
// valide → pose le cookie admin_session 90 j (même session que le mot de passe). Credential
// inconnue → 401 (refus). Met à jour le compteur anti-rejeu.
export async function POST(req: NextRequest) {
  const store = await cookies()
  const expectedChallenge = store.get(PASSKEY_CHALLENGE_COOKIE)?.value
  if (!expectedChallenge) return NextResponse.json({ error: "Challenge expiré, recommence" }, { status: 400 })

  const body = await req.json().catch(() => null)
  const response = body?.response
  if (!response?.id) return NextResponse.json({ error: "Réponse manquante" }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })
  const { data: rows } = await admin
    .from("admin_passkeys")
    .select("id, credential_id, public_key, counter, transports")

  // Credential inconnue → refus net (ne révèle pas pourquoi).
  const match = pickCredential<StoredPasskey & { id: string }>(response.id, rows as (StoredPasskey & { id: string })[])
  if (!match) {
    store.set(PASSKEY_CHALLENGE_COOKIE, "", { ...passkeyChallengeCookieOptions(), maxAge: 0 })
    return NextResponse.json({ error: "Clé non reconnue" }, { status: 401 })
  }

  const { rpID, origin } = rpConfigFromHost((await headers()).get("host"))
  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: match.credential_id,
        publicKey: new Uint8Array(fromB64url(match.public_key)),
        counter: Number(match.counter) || 0,
        transports: (match.transports as AuthenticatorTransportFuture[] | undefined) || undefined,
      },
    })
  } catch (e) {
    console.error("[passkey/login/verify]", (e as Error).message)
    return NextResponse.json({ error: "Connexion refusée" }, { status: 401 })
  } finally {
    store.set(PASSKEY_CHALLENGE_COOKIE, "", { ...passkeyChallengeCookieOptions(), maxAge: 0 })
  }

  if (!verification.verified) return NextResponse.json({ error: "Connexion refusée" }, { status: 401 })

  await admin.from("admin_passkeys")
    .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq("id", match.id)

  const res = NextResponse.json({ ok: true, redirect: "/admin/home" })
  res.cookies.set(ADMIN_COOKIE_NAME, await createAdminSessionValue(), adminCookieOptions())
  return res
}
