import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { martiniqueToday } from "@/lib/caisse-date"
import { isProduction } from "@/lib/service-du-jour"

export const dynamic = "force-dynamic"

// GET /api/admin/boutique?date=YYYY-MM-DD — écran de vente comptoir (PS-08a).
// Articles vendables au comptoir, « enfants du jour » (profils avec une commande en
// production ce jour, hors is_test), recherche de profils enfants actifs (comptes non
// archivés), ventes du jour.
export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant" }, { status: 500 })

  const date = req.nextUrl.searchParams.get("date") || martiniqueToday()

  // Articles vendables au comptoir.
  const { data: articlesRaw } = await admin
    .from("catalog_items")
    .select("id, sku, name, price_alone_cents, stock_qty, is_special, allergens, active")
    .eq("sellable_comptoir", true).eq("active", true).order("sort_order")
  const articles = (articlesRaw || [])

  // Enfants du jour : profils avec une commande en production sur ce service (hors is_test).
  const { data: ordersRaw } = await admin
    .from("orders")
    .select("status, payment_method, service_slots!inner(service_date), accounts!inner(is_test, archived_at), order_items(profils(id, prenom, classe, plafond_gouter_cents, account_id))")
    .eq("service_slots.service_date", date)
  const enfantsDuJour = new Map<string, { id: string; prenom: string; classe: string | null; account_id: string; plafond_gouter_cents: number | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (ordersRaw || []) as any[]) {
    if (o.accounts?.is_test) continue
    if (!isProduction({ status: o.status, payment_method: o.payment_method } as Parameters<typeof isProduction>[0])) continue
    for (const it of (o.order_items || [])) {
      const p = it.profils
      if (p?.id && !enfantsDuJour.has(p.id)) {
        enfantsDuJour.set(p.id, { id: p.id, prenom: p.prenom, classe: p.classe, account_id: p.account_id, plafond_gouter_cents: p.plafond_gouter_cents })
      }
    }
  }

  // Ventes du jour (plus récentes en haut).
  const { data: salesRaw } = await admin
    .from("comptoir_sales")
    .select("id, sale_number, prenom, items, total_cents, payment_mode, jeton_qty, reverses_sale_id, created_at")
    .eq("service_date", date).order("created_at", { ascending: false })

  return NextResponse.json({
    date,
    articles,
    enfants_du_jour: [...enfantsDuJour.values()],
    sales: salesRaw || [],
  })
}
