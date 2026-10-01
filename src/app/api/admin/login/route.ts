import { NextRequest, NextResponse } from "next/server"
import {
  ADMIN_COOKIE_NAME,
  adminCookieOptions,
  createAdminSessionValue,
  passwordMatches,
} from "@/lib/auth/admin-cookie"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import {
  TRUSTED_COOKIE_NAME, trustedCookieOptions,
  generateTrustedToken, hashTrustedToken, deviceLabelFromUA,
} from "@/lib/auth/trusted-device"

export const dynamic = "force-dynamic"

// POST /api/admin/login  body: { password }
// Compare au ADMIN_PASSWORD (env var Vercel, jamais exposé côté client).
// OK → pose le cookie admin signé (90 j) ET enregistre l'appareil de confiance (PS-13c) :
// jeton aléatoire en cookie httpOnly 1 an + haché stocké en base. KO → 401.
export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) {
    console.error("[admin/login] ADMIN_PASSWORD non configuré")
    return NextResponse.json({ error: "Accès admin non configuré" }, { status: 500 })
  }

  let password = ""
  try {
    const body = await req.json()
    password = typeof body?.password === "string" ? body.password : ""
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 })
  }

  if (!password || !passwordMatches(password, expected)) {
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE_NAME, await createAdminSessionValue(), adminCookieOptions())

  // PS-13c — mémorise cet appareil comme « de confiance » (sauf si déjà enregistré via cookie valide).
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = getSupabaseAdmin()
    if (admin) {
      const existing = req.cookies.get(TRUSTED_COOKIE_NAME)?.value
      let token = existing || ""
      let isNew = false
      if (existing) {
        // Appareil déjà connu → on rafraîchit sa dernière visite ; sinon on le (re)crée.
        const { data } = await admin.from("trusted_devices").select("id").eq("token_hash", await hashTrustedToken(existing)).maybeSingle()
        if (data?.id) await admin.from("trusted_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id)
        else isNew = true
      } else { isNew = true }

      if (isNew) {
        token = generateTrustedToken()
        const ua = req.headers.get("user-agent")
        await admin.from("trusted_devices").insert({
          token_hash: await hashTrustedToken(token),
          device_label: deviceLabelFromUA(ua),
          user_agent: ua,
        })
      }
      res.cookies.set(TRUSTED_COOKIE_NAME, token, trustedCookieOptions())
    }
  } catch (e) {
    console.error("[admin/login] trusted-device", (e as Error).message) // non bloquant
  }

  return res
}
