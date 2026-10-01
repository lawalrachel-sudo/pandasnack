import { NextRequest, NextResponse } from "next/server"
import { cookies, headers } from "next/headers"
import { generateRegistrationOptions } from "@simplewebauthn/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import {
  rpConfigFromHost, ADMIN_PASSKEY_USER_ID, ADMIN_PASSKEY_USER_NAME, ADMIN_PASSKEY_USER_DISPLAY,
  PASSKEY_CHALLENGE_COOKIE, passkeyChallengeCookieOptions,
} from "@/lib/auth/passkey"

export const dynamic = "force-dynamic"

// POST /api/admin/passkey/register/options — réservé admin (cookie mot de passe OU session admin).
// Prépare l'enrôlement d'une passkey sur CET appareil. Stocke le challenge en cookie httpOnly.
export async function POST() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error

  const { rpID, rpName } = rpConfigFromHost((await headers()).get("host"))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  const { data: existing } = admin
    ? await admin.from("admin_passkeys").select("credential_id, transports")
    : { data: [] }

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(ADMIN_PASSKEY_USER_ID),
    userName: ADMIN_PASSKEY_USER_NAME,
    userDisplayName: ADMIN_PASSKEY_USER_DISPLAY,
    attestationType: "none",
    // Évite de ré-enrôler un appareil déjà connu.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    excludeCredentials: (existing || []).map((c: any) => ({
      id: c.credential_id,
      transports: c.transports || undefined,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  })

  const store = await cookies()
  store.set(PASSKEY_CHALLENGE_COOKIE, options.challenge, passkeyChallengeCookieOptions())
  return NextResponse.json(options)
}

export async function GET(req: NextRequest) { void req; return POST() }
