import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin, SOURCE_LABELS } from "@/lib/auth/admin"

export const dynamic = "force-dynamic"

// GET /api/admin/orders?from=YYYY-MM-DD&to=YYYY-MM-DD&source_group=...&source_detail=...&status=...
// Retourne les commandes + items détaillés sur la fenêtre service_date donnée.
// from + to sont REQUIS. status omis = tous (sauf cancelled qu'on garde pour traçabilité).
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
  const sourceDetail = sp.get("source_detail")
  const status = sp.get("status")

  let query = supabase
    .from("orders")
    .select(`
      id, order_number, status, total_cents, paid_at, created_at, special_request,
      service_slots!inner(service_date, day_type, target_source_group, delivery_points(name)),
      accounts!inner(id, nom_compte, email, telephone, source_group, source_detail),
      order_items(
        id, profil_id, prenom_libre, quantity, unit_price_cents, line_total_cents,
        formula_choices, topping_ids, takeaway, notes,
        menu_formulas(id, name, code, dlc_hours),
        catalog_items(id, sku, name, allergens, dlc_hours, category_id),
        profils(id, prenom, classe)
      )
    `)
    .gte("service_slots.service_date", from)
    .lte("service_slots.service_date", to)

  if (sourceGroup) query = query.eq("accounts.source_group", sourceGroup)
  if (sourceDetail) query = query.eq("accounts.source_detail", sourceDetail)
  if (status) query = query.eq("status", status)

  const { data, error } = await query
  if (error) {
    console.error("[admin/orders]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = (data || []).map((o: any) => ({
    id: o.id,
    order_number: o.order_number,
    service_date: o.service_slots?.service_date,
    day_type: o.service_slots?.day_type,
    delivery_point: o.service_slots?.delivery_points?.name || null,
    source_group: o.accounts?.source_group,
    source_detail: o.accounts?.source_detail,
    source_label: SOURCE_LABELS[o.accounts?.source_group] || o.accounts?.source_group,
    status: o.status,
    paid_at: o.paid_at,
    created_at: o.created_at,
    total_cents: o.total_cents,
    special_request: o.special_request,
    account: {
      id: o.accounts?.id,
      nom_compte: o.accounts?.nom_compte,
      email: o.accounts?.email,
      telephone: o.accounts?.telephone,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (o.order_items || []).map((it: any) => ({
      id: it.id,
      profil_id: it.profil_id,
      profil_prenom: it.profils?.prenom || it.prenom_libre || null,
      profil_classe: it.profils?.classe || null,
      menu_formula_id: it.menu_formulas?.id || null,
      menu_formula_name: it.menu_formulas?.name || null,
      menu_formula_code: it.menu_formulas?.code || null,
      catalog_item_id: it.catalog_items?.id || null,
      catalog_item_sku: it.catalog_items?.sku || null,
      catalog_item_name: it.catalog_items?.name || null,
      category_id: it.catalog_items?.category_id || null,
      formula_choices: it.formula_choices,
      topping_ids: it.topping_ids || [],
      allergens: it.catalog_items?.allergens || [],
      dlc_hours: it.menu_formulas?.dlc_hours ?? it.catalog_items?.dlc_hours ?? 24,
      qty: it.quantity || 1,
      price_cents: it.line_total_cents,
      takeaway: it.takeaway || false,
      notes: it.notes,
    })),
  }))

  // Tri service_date ASC puis order_number ASC
  orders.sort((a: { service_date: string; order_number: string }, b: { service_date: string; order_number: string }) => {
    if (a.service_date !== b.service_date) return (a.service_date || "").localeCompare(b.service_date || "")
    return (a.order_number || "").localeCompare(b.order_number || "")
  })

  return NextResponse.json({ orders })
}
