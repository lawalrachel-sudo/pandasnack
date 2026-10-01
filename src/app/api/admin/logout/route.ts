import { NextRequest, NextResponse } from "next/server"
import { ADMIN_COOKIE_NAME } from "@/lib/auth/admin-cookie"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { TRUSTED_COOKIE_NAME, hashTrustedToken } from "@/lib/auth/trusted-device"

export const dynamic = "force-dynamic"

// POST /api/admin/logout — efface le cookie admin ET « oublie » cet appareil de confiance
// (sinon, sur un appareil de confiance, le middleware re-rentrerait aussitôt → bouton inutile).
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true })
  const clear = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 0 }
  res.cookies.set(ADMIN_COOKIE_NAME, "", clear)

  const trusted = req.cookies.get(TRUSTED_COOKIE_NAME)?.value
  if (trusted) {
    res.cookies.set(TRUSTED_COOKIE_NAME, "", clear)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin: any = getSupabaseAdmin()
      if (admin) await admin.from("trusted_devices").delete().eq("token_hash", await hashTrustedToken(trusted))
    } catch { /* non bloquant */ }
  }
  return res
}
