import { NextResponse } from "next/server"
import { cookies, headers } from "next/headers"
import { generateAuthenticationOptions } from "@simplewebauthn/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import {
  rpConfigFromHost, PASSKEY_CHALLENGE_COOKIE, passkeyChallengeCookieOptions,
} from "@/lib/auth/passkey"

export const dynamic = "force-dynamic"

// POST /api/admin/passkey/login/options — PUBLIC (pré-connexion). Renvoie les options d'auth et
// mémorise le challenge. allowCredentials = toutes les passkeys admin connues (sinon usernameless).
export async function POST() {
  const { rpID } = rpConfigFromHost((await headers()).get("host"))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  const { data: rows } = admin
    ? await admin.from("admin_passkeys").select("credential_id, transports")
    : { data: [] }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allowCredentials: (rows || []).map((c: any) => ({
      id: c.credential_id,
      transports: c.transports || undefined,
    })),
  })

  const store = await cookies()
  store.set(PASSKEY_CHALLENGE_COOKIE, options.challenge, passkeyChallengeCookieOptions())
  return NextResponse.json(options)
}
