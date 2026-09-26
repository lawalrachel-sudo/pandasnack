import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { notesHaveSauce } from "@/lib/menu-options"

export const dynamic = "force-dynamic"

// GET /api/admin/service?date=YYYY-MM-DD
// Vue « Service du jour » (PS-06b). Public unique = pandattitude : pas de filtre métier.
//
// - Sans `date` : le PROCHAIN service (slot actif pandattitude, date ≥ aujourd'hui),
//   sinon le plus récent passé.
// - Renvoie le slot résolu (+ cutoff), la navigation ‹ › (dates préc./suiv.), et les
//   commandes du jour enrichies (is_test, prepared_at, payment_mode, téléphone, options).
//   La classification / les compteurs sont calculés côté client via src/lib/service-du-jour.

const TARGET = "pandattitude"

export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant" }, { status: 500 })

  const askedDate = req.nextUrl.searchParams.get("date")
  const today = new Date().toISOString().split("T")[0]

  // Tous les services pandattitude actifs, pour la navigation et la résolution par défaut.
  const { data: slotsRaw, error: slotsErr } = await admin
    .from("service_slots")
    .select("id, service_date, orders_cutoff_at, delivery_points(name)")
    .eq("active", true)
    .eq("target_source_group", TARGET)
    .order("service_date", { ascending: true })
  if (slotsErr) {
    console.error("[admin/service] slots:", slotsErr)
    return NextResponse.json({ error: slotsErr.message }, { status: 500 })
  }
  const slots = (slotsRaw || []) as Array<{ id: string; service_date: string; orders_cutoff_at: string | null; delivery_points: { name: string } | null }>
  if (slots.length === 0) {
    return NextResponse.json({ slot: null, nav: { prev: null, next: null }, orders: [] })
  }

  // Date résolue : demandée si elle existe, sinon prochain service, sinon dernier passé.
  let idx = -1
  if (askedDate) idx = slots.findIndex((s) => s.service_date === askedDate)
  if (idx === -1) {
    idx = slots.findIndex((s) => s.service_date >= today)
    if (idx === -1) idx = slots.length - 1
  }
  const slot = slots[idx]
  const nav = {
    prev: idx > 0 ? slots[idx - 1].service_date : null,
    next: idx < slots.length - 1 ? slots[idx + 1].service_date : null,
  }
  const cutoffPassed = slot.orders_cutoff_at ? new Date() >= new Date(slot.orders_cutoff_at) : false

  // Commandes du service (toutes, y compris cancelled et comptes test : le client trie).
  const { data: ordersRaw, error: ordErr } = await admin
    .from("orders")
    .select(`
      id, order_number, status, total_cents, paid_at, payment_method, payment_mode, prepared_at,
      created_at, special_request,
      accounts!inner(id, nom_compte, telephone, is_test),
      order_items(
        id, prenom_libre, quantity, notes, formula_choices, topping_ids,
        menu_formulas(name),
        catalog_items(name, sku, category_id, allergens),
        profils(prenom, classe, notes_allergies)
      )
    `)
    .eq("service_slot_id", slot.id)
  if (ordErr) {
    console.error("[admin/service] orders:", ordErr)
    return NextResponse.json({ error: ordErr.message }, { status: 500 })
  }

  // PS-06c-b — résolution des toppings (id → nom) pour afficher les options (carottes, piment…).
  const { data: toppingsRef } = await admin.from("toppings").select("id, name")
  const topName: Record<string, string> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (toppingsRef || []).map((t: any) => [t.id, t.name])
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = (ordersRaw || []).map((o: any) => {
    const items = (o.order_items || [])
    // Prénom/classe/allergies de l'enfant : depuis le 1er item rattaché à un profil.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withProfil = items.find((it: any) => it.profils) || items[0] || null
    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      payment_method: o.payment_method,
      paid_at: o.paid_at,
      payment_mode: o.payment_mode,
      prepared_at: o.prepared_at,
      total_cents: o.total_cents,
      special_request: o.special_request,
      created_at: o.created_at,
      account_id: o.accounts?.id || null,
      is_test: !!o.accounts?.is_test,
      child_prenom: withProfil?.profils?.prenom || withProfil?.prenom_libre || o.accounts?.nom_compte || null,
      child_classe: withProfil?.profils?.classe || null,
      notes_allergies: withProfil?.profils?.notes_allergies || null,
      parent_nom: o.accounts?.nom_compte || null,
      parent_telephone: o.accounts?.telephone || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: items.map((it: any) => {
        const ids: string[] = it.topping_ids || it.formula_choices?.toppings || []
        const toppings = ids.map((id) => topName[id]).filter(Boolean)
        return {
          notes: it.notes,
          menu_formula_name: it.menu_formulas?.name || null,
          catalog_item_name: it.catalog_items?.name || null,
          catalog_item_sku: it.catalog_items?.sku || null,
          category_id: it.catalog_items?.category_id || null,
          allergens: it.catalog_items?.allergens || [],
          qty: it.quantity || 1,
          toppings,
          has_sauce: notesHaveSauce(it.notes) || toppings.some((n) => /sauce\s*piment|piment/i.test(n)),
        }
      }),
    }
  })

  return NextResponse.json({
    slot: {
      id: slot.id,
      service_date: slot.service_date,
      orders_cutoff_at: slot.orders_cutoff_at,
      cutoff_passed: cutoffPassed,
      delivery_point: slot.delivery_points?.name || null,
    },
    nav,
    orders,
  })
}
