import { NextRequest, NextResponse } from "next/server"
import { cookies, headers } from "next/headers"
import { verifyRegistrationResponse } from "@simplewebauthn/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import {
  rpConfigFromHost, PASSKEY_CHALLENGE_COOKIE, passkeyChallengeCookieOptions, toB64url,
} from "@/lib/auth/passkey"

export const dynamic = "force-dynamic"

// POST /api/admin/passkey/register/verify — réservé admin. Vérifie la réponse d'enrôlement et
// enregistre la passkey (credential_id, clé publique, compteur) pour CET appareil.
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error

  const store = await cookies()
  const expectedChallenge = store.get(PASSKEY_CHALLENGE_COOKIE)?.value
  if (!expectedChallenge) return NextResponse.json({ error: "Challenge expiré, recommence" }, { status: 400 })

  const body = await req.json().catch(() => null)
  const response = body?.response
  const deviceLabel: string = typeof body?.deviceLabel === "string" && body.deviceLabel.trim()
    ? body.deviceLabel.trim().slice(0, 60) : "Cet appareil"
  if (!response) return NextResponse.json({ error: "Réponse manquante" }, { status: 400 })

  const { rpID, origin } = rpConfigFromHost((await headers()).get("host"))

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    })
  } catch (e) {
    console.error("[passkey/register/verify]", (e as Error).message)
    return NextResponse.json({ error: "Enregistrement refusé" }, { status: 400 })
  }

  store.set(PASSKEY_CHALLENGE_COOKIE, "", { ...passkeyChallengeCookieOptions(), maxAge: 0 })

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Enregistrement non vérifié" }, { status: 400 })
  }

  const info = verification.registrationInfo
  const cred = info.credential
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { error } = await admin.from("admin_passkeys").insert({
    credential_id: cred.id,               // déjà base64url (@simplewebauthn v13)
    public_key: toB64url(cred.publicKey),
    counter: cred.counter ?? 0,
    transports: cred.transports || null,
    device_label: deviceLabel,
    backed_up: !!info.credentialBackedUp,
  })
  if (error) {
    // Conflit d'unicité = appareil déjà enrôlé → succès idempotent.
    if (String(error.code) === "23505") return NextResponse.json({ ok: true, already: true })
    console.error("[passkey/register/verify] insert", error.message)
    return NextResponse.json({ error: "Impossible d'enregistrer la passkey" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, deviceLabel })
}
