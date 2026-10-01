import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { TRUSTED_COOKIE_NAME, hashTrustedToken } from "@/lib/auth/trusted-device"

export const dynamic = "force-dynamic"

// POST /api/admin/devices/remove  body: { id } — réservé admin. Retire un appareil de confiance.
// Si c'est l'appareil courant, on efface aussi son cookie (il redemandera le mot de passe).
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === "string" ? body.id : null
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const currentTok = req.cookies.get(TRUSTED_COOKIE_NAME)?.value
  const currentHash = currentTok ? await hashTrustedToken(currentTok) : null
  const { data: row } = await admin.from("trusted_devices").select("token_hash").eq("id", id).maybeSingle()
  await admin.from("trusted_devices").delete().eq("id", id)

  const res = NextResponse.json({ ok: true })
  if (row && currentHash && row.token_hash === currentHash) {
    res.cookies.set(TRUSTED_COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 })
  }
  return res
}
