import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"

export const dynamic = "force-dynamic"

// POST /api/admin/mark-prepared — PS-06b §3 : basculer l'état « préparé » d'une commande.
// Body: { orderId, prepared: boolean }. Effet : prepared_at = now() | null.
// Réservé aux commandes en production (paid OU on_site) et jamais annulées : le statut prime.
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || key === "xxx") return null
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const { orderId, prepared } = await req.json().catch(() => ({})) as { orderId?: string; prepared?: boolean }
  if (!orderId || typeof prepared !== "boolean") {
    return NextResponse.json({ error: "orderId et prepared (boolean) requis" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data, error } = await admin
    .from("orders")
    .update({ prepared_at: prepared ? new Date().toISOString() : null })
    .eq("id", orderId)
    .neq("status", "cancelled")
    .select("id, prepared_at, status")
  if (error) {
    console.error("[admin/mark-prepared]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Commande introuvable ou annulée" }, { status: 404 })
  }
  return NextResponse.json({ success: true, orderId, prepared_at: data[0].prepared_at })
}
