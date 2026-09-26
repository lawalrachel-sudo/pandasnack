import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// GET /api/admin/clients/[id] — PS-06a §2 : fiche d'un compte parent.
// Enfants (actifs/inactifs), solde, historique wallet_transactions, commandes.
// Renvoie aussi la grille de bonus active pour le formulaire de crédit manuel.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant" }, { status: 500 })

  const { data: account, error: accErr } = await admin
    .from("accounts")
    .select("id, nom_compte, email, telephone, source_group, is_test, panda_id")
    .eq("id", id).maybeSingle()
  if (accErr) { console.error("[admin/clients/id]", accErr); return NextResponse.json({ error: accErr.message }, { status: 500 }) }
  if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })

  const { data: profils } = await admin
    .from("profils").select("id, prenom, classe, active, archived_at, type_profil, notes_allergies")
    .eq("account_id", id).order("is_default", { ascending: false }).order("created_at")

  const { data: wallet } = await admin
    .from("wallets").select("id, balance_cents, total_credited_cents, total_debited_cents, expires_at")
    .eq("account_id", id).maybeSingle()

  const tx = wallet
    ? (await admin
        .from("wallet_transactions")
        .select("id, type, amount_cents, balance_after_cents, description, stripe_payment_intent_id, created_at")
        .eq("wallet_id", wallet.id).order("created_at", { ascending: false }).limit(50)).data
    : []

  const { data: orders } = await admin
    .from("orders")
    .select("id, order_number, status, payment_method, total_cents, created_at, service_slots(service_date)")
    .eq("account_id", id).order("created_at", { ascending: false }).limit(50)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordersOut = (orders || []).map((o: any) => ({
    id: o.id, order_number: o.order_number, status: o.status, payment_method: o.payment_method,
    total_cents: o.total_cents, created_at: o.created_at, service_date: o.service_slots?.service_date || null,
  }))

  const { data: tiers } = await admin
    .from("wallet_recharge_config")
    .select("recharge_cents, bonus_cents, active").eq("active", true).order("sort_order")

  return NextResponse.json({
    account,
    profils: profils || [],
    wallet: wallet || null,
    transactions: tx || [],
    orders: ordersOut,
    bonus_tiers: tiers || [],
  })
}
