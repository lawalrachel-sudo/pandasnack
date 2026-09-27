import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// POST /api/admin/boutique/reverse — PS-08a. Annule une vente (contre-écriture).
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const { saleId } = await req.json().catch(() => ({})) as { saleId?: string }
  if (!saleId) return NextResponse.json({ error: "saleId requis" }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data, error } = await admin.rpc("comptoir_reverse", { p_sale_id: saleId })
  if (error) {
    const code = (error.message || "").trim()
    const msg = code === "DEJA_ANNULEE" ? "Vente déjà annulée."
      : code === "VENTE_INTROUVABLE" ? "Vente introuvable."
      : code === "PAS_ANNULABLE" ? "Cette ligne est déjà une annulation."
      : "Annulation impossible."
    console.error("[boutique/reverse]", code)
    return NextResponse.json({ error: msg, code }, { status: 400 })
  }
  return NextResponse.json({ success: true, reversal: data })
}
