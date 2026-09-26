import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// GET /api/admin/clients — PS-06a §1 : liste des comptes parents pour l'admin.
// Nom, email, tél, enfants actifs, solde wallet, total crédité, nb commandes, dernière commande.
// Tri par défaut : solde décroissant (côté client). Comptes test inclus mais marqués.
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant" }, { status: 500 })

  const { data, error } = await admin
    .from("accounts")
    .select(`
      id, nom_compte, email, telephone, source_group, is_test,
      profils(prenom, classe, active, archived_at, type_profil),
      wallets(balance_cents, total_credited_cents),
      orders(id, status, created_at, service_slots(service_date))
    `)
    .eq("source_group", "pandattitude")
  if (error) {
    console.error("[admin/clients]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clients = (data || []).map((a: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enfants = (a.profils || []).filter((p: any) => p.active && !p.archived_at && p.type_profil === "eleve")
      .map((p: { prenom: string; classe: string | null }) => ({ prenom: p.prenom, classe: p.classe }))
    const wallet = Array.isArray(a.wallets) ? a.wallets[0] : a.wallets
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = (a.orders || []) as any[]
    const paidOrders = orders.filter((o) => o.status === "paid")
    const lastService = paidOrders
      .map((o) => o.service_slots?.service_date)
      .filter(Boolean)
      .sort()
      .pop() || null
    return {
      id: a.id,
      nom_compte: a.nom_compte,
      email: a.email,
      telephone: a.telephone,
      is_test: !!a.is_test,
      enfants,
      balance_cents: wallet?.balance_cents || 0,
      total_credited_cents: wallet?.total_credited_cents || 0,
      orders_count: paidOrders.length,
      last_service_date: lastService,
    }
  })

  return NextResponse.json({ clients })
}
