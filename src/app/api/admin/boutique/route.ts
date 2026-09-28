import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { martiniqueToday, addDays } from "@/lib/caisse-date"
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

  // Articles vendables au comptoir (parents + variantes actives). Un parent avec variantes
  // masque son propre stock : on expose Σ stock des variantes et la liste des variantes.
  const { data: articlesRaw } = await admin
    .from("catalog_items")
    .select("id, sku, name, price_alone_cents, stock_qty, is_special, allergens, active, parent_id, jeton_price")
    .eq("sellable_comptoir", true).eq("active", true).order("sort_order")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (articlesRaw || []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variantsByParent = new Map<string, any[]>()
  for (const r of rows) {
    if (!r.parent_id) continue
    const list = variantsByParent.get(r.parent_id) || []
    list.push({ id: r.id, sku: r.sku, name: r.name, stock_qty: r.stock_qty, jeton_price: r.jeton_price })
    variantsByParent.set(r.parent_id, list)
  }
  const articles = rows.filter((r) => !r.parent_id).map((p) => {
    const variants = variantsByParent.get(p.id) || []
    // Σ stock : somme des variantes suivies ; null si toutes non suivies.
    const tracked = variants.filter((v) => v.stock_qty !== null && v.stock_qty !== undefined)
    const stock_qty = variants.length ? (tracked.length ? tracked.reduce((s, v) => s + v.stock_qty, 0) : null) : p.stock_qty
    return { ...p, variants, stock_qty }
  })

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

  // PS-08a-e — « Ventes du jour » = ventes ENCAISSÉES aujourd'hui (created_at Martinique),
  // quelle que soit la date de service. Jour Martinique = [date 04:00 UTC, date+1 04:00 UTC).
  const startUtc = `${date}T04:00:00.000Z`
  const endUtc = `${addDays(date, 1)}T04:00:00.000Z`
  const { data: salesRaw } = await admin
    .from("comptoir_sales")
    .select("id, sale_number, prenom, items, total_cents, payment_mode, jeton_qty, reverses_sale_id, created_at, service_date")
    .gte("created_at", startUtc).lt("created_at", endUtc).order("created_at", { ascending: false })

  // PS-08a-e — prochains jours de service ouverts (pandattitude actifs, à venir) pour la pilule date.
  const { data: slotsRaw } = await admin
    .from("service_slots")
    .select("service_date")
    .eq("active", true).eq("target_source_group", "pandattitude")
    .gte("service_date", date).order("service_date", { ascending: true }).limit(5)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceDays = [...new Set((slotsRaw || []).map((s: any) => s.service_date))]

  return NextResponse.json({
    date,
    articles,
    enfants_du_jour: [...enfantsDuJour.values()],
    sales: salesRaw || [],
    service_days: serviceDays,
  })
}
