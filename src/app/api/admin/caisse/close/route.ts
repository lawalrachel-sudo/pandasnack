import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// POST /api/admin/caisse/close — PS-08a-b. Clôture manuelle (« Clôturer maintenant »).
// La clôture automatique passe par /api/cron/cloture. Idempotent : caisse_close renvoie
// la clôture existante si déjà figée. { period_type, period_start }.
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const body = await req.json().catch(() => ({}))
  const type = body?.period_type as string
  const start = body?.period_start as string
  if (!["jour", "mois", "annee"].includes(type) || !/^\d{4}-\d{2}-\d{2}$/.test(start || "")) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data, error } = await admin.rpc("caisse_close", { p_type: type, p_start: start })
  if (error) {
    console.error("[caisse/close]", error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ success: true, cloture: data })
}
