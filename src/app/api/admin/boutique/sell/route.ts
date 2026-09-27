import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { saleErrorMessage } from "@/lib/comptoir"

export const dynamic = "force-dynamic"

// POST /api/admin/boutique/sell — PS-08a. Enregistre une vente comptoir via la fonction
// SQL transactionnelle comptoir_sell (autorité : verrou wallet, plafond, stock, idempotence).
// L'appli n'encaisse aucun euro : especes/cb_sumup = SumUp hors appli, on note la vente.
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const body = await req.json().catch(() => ({}))
  if (!body?.idempotency_key) return NextResponse.json({ error: "idempotency_key requis" }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data, error } = await admin.rpc("comptoir_sell", { payload: body })
  if (error) {
    // Le code métier est dans error.message ; le détail (montants) dans error.details (jsonb).
    const code = (error.message || "").trim()
    let detail: Record<string, unknown> | null = null
    try { detail = error.details ? JSON.parse(error.details) : null } catch { detail = null }
    console.error("[boutique/sell]", code, error.details)
    return NextResponse.json({ error: saleErrorMessage(code, detail), code, detail }, { status: 400 })
  }
  return NextResponse.json({ success: true, sale: data })
}
