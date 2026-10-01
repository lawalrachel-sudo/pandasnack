import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// GET /api/admin/passkey/list — réservé admin. Liste les appareils enrôlés (pour l'écran réglages).
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  const { data } = admin
    ? await admin.from("admin_passkeys").select("id, device_label, created_at, last_used_at").order("created_at")
    : { data: [] }
  return NextResponse.json({ passkeys: data || [] })
}
