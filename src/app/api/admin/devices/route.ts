import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { TRUSTED_COOKIE_NAME, hashTrustedToken } from "@/lib/auth/trusted-device"

export const dynamic = "force-dynamic"

// GET /api/admin/devices — réservé admin. Liste les appareils de confiance (« Mes appareils »),
// avec un drapeau « current » pour l'appareil utilisé maintenant.
export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  const { data } = admin
    ? await admin.from("trusted_devices").select("id, device_label, created_at, last_seen_at, token_hash").order("last_seen_at", { ascending: false })
    : { data: [] }

  const currentTok = req.cookies.get(TRUSTED_COOKIE_NAME)?.value
  const currentHash = currentTok ? await hashTrustedToken(currentTok) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const devices = (data || []).map((d: any) => ({
    id: d.id, device_label: d.device_label, created_at: d.created_at, last_seen_at: d.last_seen_at,
    current: !!currentHash && d.token_hash === currentHash,
  }))
  return NextResponse.json({ devices })
}
