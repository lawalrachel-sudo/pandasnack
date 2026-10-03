import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// POST /api/admin/sa-ki-ni/cancel  body: { orderId }
// Annulation admin d'une commande Sa ki ni : recrédit wallet + rend la portion (RPC transactionnelle).
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const body = await req.json().catch(() => null)
  const orderId: string | undefined = body?.orderId
  if (!orderId) return NextResponse.json({ error: "orderId requis" }, { status: 400 })

  const { data, error } = await admin.rpc("sa_ki_ni_reverse", { p_order_id: orderId })
  if (error) {
    console.error("[admin/sa-ki-ni/cancel]", error.message)
    const msg = (error.message || "").includes("SKN_INTROUVABLE") ? "Commande Sa ki ni introuvable" : "Annulation impossible"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  const row = Array.isArray(data) ? data[0] : data
  return NextResponse.json({ ok: true, refundedCents: row?.refunded_cents ?? 0, portionsReturned: row?.portions_returned ?? 0 })
}
