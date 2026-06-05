import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"

export const dynamic = "force-dynamic"

// Client service_role (bypass RLS) — l'admin encaisse une commande qui ne lui appartient
// pas, et l'accès admin peut se faire par cookie signé (auth.uid() NULL). Même pattern que
// le webhook Stripe. L'autorisation est portée en amont par requireAdmin.
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || key === "xxx") return null
  return createClient(url, key)
}

// POST /api/admin/mark-paid — §7 : pointer l'encaissement comptoir d'une commande "sur place".
// Body: { orderId }. Effet : status='paid' + paid_at=now() → la commande entre dans le CA
// encaissé du récap (décision B). 'paid' existe déjà dans l'enum (pas de changement de schéma).
// Idempotent (ne re-touche pas une commande déjà encaissée) et borné à payment_method='on_site'.
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const { orderId } = await req.json().catch(() => ({})) as { orderId?: string }
  if (!orderId) return NextResponse.json({ error: "orderId requis" }, { status: 400 })

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const paidAt = new Date().toISOString()
  const { data, error } = await admin
    .from("orders")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", orderId)
    .eq("payment_method", "on_site")
    .is("paid_at", null)
    .select("id, paid_at, status")
  if (error) {
    console.error("[admin/mark-paid]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) {
    // Soit déjà encaissée, soit pas une commande "sur place" → rien à faire.
    return NextResponse.json({ error: "Commande introuvable ou déjà encaissée" }, { status: 404 })
  }

  return NextResponse.json({ success: true, orderId, paid_at: paidAt, status: "paid" })
}
