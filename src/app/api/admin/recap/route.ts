import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"

export const dynamic = "force-dynamic"

// GET /api/admin/recap?from=YYYY-MM-DD&to=YYYY-MM-DD&source_group=...
// Totaux et production breakdown — paid uniquement (les pending ne gonflent pas la prod).
export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const sp = req.nextUrl.searchParams
  const from = sp.get("from")
  const to = sp.get("to")
  if (!from || !to) {
    return NextResponse.json({ error: "from et to requis (YYYY-MM-DD)" }, { status: 400 })
  }
  const sourceGroup = sp.get("source_group")

  let query = supabase
    .from("orders")
    .select(`
      id, status, total_cents,
      service_slots!inner(service_date),
      accounts!inner(source_group, source_detail),
      order_items(
        id, formula_choices, topping_ids,
        menu_formulas(id, name, code),
        catalog_items(id, name, sku, category_id)
      )
    `)
    .gte("service_slots.service_date", from)
    .lte("service_slots.service_date", to)

  if (sourceGroup) query = query.eq("accounts.source_group", sourceGroup)

  const { data: ordersAll, error } = await query
  if (error) {
    console.error("[admin/recap]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (ordersAll || []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paidOrders = list.filter((o: any) => o.status === "paid")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingOrders = list.filter((o: any) => o.status === "pending_payment")

  // Totaux + ventilation par source_group (sur paid uniquement)
  const revenueBySource: Record<string, number> = {}
  for (const o of paidOrders) {
    const sg = o.accounts?.source_group || "unknown"
    const sd = o.accounts?.source_detail
    const key = sd ? `${sg}_${sd}` : sg
    revenueBySource[key] = (revenueBySource[key] || 0) + (o.total_cents || 0)
  }
  const revenueCents = paidOrders.reduce((s, o) => s + (o.total_cents || 0), 0)

  // Catalogue catégories pour grouper la production items
  const { data: categories } = await supabase
    .from("catalog_categories").select("id, name")
  const catNames: Record<string, string> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (categories || []).map((c: any) => [c.id, c.name])
  )

  // Toppings ref (pour résoudre les noms dans formula_choices)
  const { data: toppings } = await supabase.from("toppings").select("id, name")
  const topNames: Record<string, string> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (toppings || []).map((t: any) => [t.id, t.name])
  )

  // Production : 2 sections — menus (formula+plat composé) et items (vendus seuls).
  // Map menu : key=formula_id → { name, qty, details: [{label, qty}] }
  const menusMap = new Map<string, { name: string; qty: number; details: Map<string, number> }>()
  // Map items : key=category_id → { catName, qty_total, details: Map<itemName, qty> }
  const itemsMap = new Map<string, { category: string; qty_total: number; details: Map<string, number> }>()

  for (const o of paidOrders) {
    for (const it of (o.order_items || [])) {
      const formulaId = it.menu_formulas?.id
      if (formulaId) {
        // Menu composé : on agrège par formula, et le détail = plat choisi (catalog_item_name) + toppings
        const fname = it.menu_formulas?.name || "Menu"
        const entry = menusMap.get(formulaId) || { name: fname, qty: 0, details: new Map() }
        entry.qty += 1
        // Détail principal = plat
        const platName = it.catalog_items?.name || "Plat libre"
        const platLabel = `${platName}`
        entry.details.set(platLabel, (entry.details.get(platLabel) || 0) + 1)
        menusMap.set(formulaId, entry)
      } else if (it.catalog_items) {
        // Item solo : agrégé par catégorie
        const catId = it.catalog_items.category_id || "uncategorized"
        const catName = catNames[catId] || catId
        const entry = itemsMap.get(catId) || { category: catName, qty_total: 0, details: new Map() }
        entry.qty_total += 1
        const itemName = it.catalog_items.name || it.catalog_items.sku || "Article"
        entry.details.set(itemName, (entry.details.get(itemName) || 0) + 1)
        itemsMap.set(catId, entry)
      }
    }
  }

  const menus = Array.from(menusMap.values())
    .sort((a, b) => b.qty - a.qty)
    .map(m => ({
      name: m.name,
      qty: m.qty,
      details: Array.from(m.details.entries())
        .map(([label, qty]) => ({ label, qty }))
        .sort((a, b) => b.qty - a.qty),
    }))

  const items = Array.from(itemsMap.values())
    .sort((a, b) => b.qty_total - a.qty_total)
    .map(c => ({
      category: c.category,
      qty_total: c.qty_total,
      details: Array.from(c.details.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty),
    }))

  // Suppression de la propriété toppings_unfiltered injectée par le SELECT (artefact)
  void topNames

  return NextResponse.json({
    period: { from, to },
    totals: {
      orders_count: paidOrders.length + pendingOrders.length,
      orders_paid: paidOrders.length,
      orders_pending: pendingOrders.length,
      revenue_cents: revenueCents,
      revenue_by_source: revenueBySource,
    },
    production: {
      menus,
      items,
    },
  })
}
