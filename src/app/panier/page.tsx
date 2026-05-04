import { createServerSupabase as createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { PanierClient } from "./PanierClient"

// POINT 6 — force-dynamic : pas de cache, données fraîches au retour Stripe
export const dynamic = "force-dynamic"

export default async function PanierPage() {
  const supabase: any = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth")  // FIX: était /connexion

  const { data: account } = await supabase
    .from("accounts")
    .select("id, nom_compte, source_group, source_detail")
    .eq("auth_user_id", user.id)
    .single()
  if (!account) redirect("/onboarding")

  const { data: profils } = await supabase
    .from("profils")
    .select("id, prenom, classe, metier, is_default, active")
    .eq("account_id", account.id)
    .eq("active", true)
    .order("is_default", { ascending: false })

  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  const { data: orders } = await supabase
    .from("orders")
    .select(`
      id, order_number, status, total_cents, payment_method, created_at, paid_at, special_request,
      service_slots!inner(id, service_date, day_type, orders_cutoff_at, delivery_points(name)),
      order_items(id, notes, quantity, unit_price_cents, line_total_cents, takeaway, profil_id, prenom_libre, catalog_item_id, menu_formula_id, topping_ids, catalog_items(id, name, sku), menu_formulas(id, name, code), profils(prenom))
    `)
    .eq("account_id", account.id)
    .gte("created_at", sixtyDaysAgo.toISOString())
    .order("created_at", { ascending: false })

  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance_cents")
    .eq("account_id", account.id)
    .single()

  const today = new Date().toISOString().split("T")[0]
  const { data: upcomingSlots } = await supabase
    .from("service_slots")
    .select("id, service_date, day_type, orders_cutoff_at")
    .eq("active", true)
    .gte("service_date", today)
    .order("service_date")
    .limit(30)

  // H2.1 — catalog items (sellable_alone OU sellable_in_menu) pour modal "Ajouter" + édition inline B-α-ter
  const { data: catalogItems } = await supabase
    .from("catalog_items")
    .select("id, sku, name, emoji, description, price_alone_cents, image_url, sellable_alone, sellable_in_menu, active, ui_group, sort_order, category_id")
    .eq("active", true)
    .or("sellable_alone.eq.true,sellable_in_menu.eq.true")
    .order("sort_order")

  // Phase 2 (Brief 3-E) — toppings + applies_to_category_ids pour cascade B-α-ter
  const { data: toppings } = await supabase
    .from("toppings")
    .select("id, name, emoji, applies_to_category_ids")
    .eq("active", true)
    .order("sort_order")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingCount = (orders || []).filter((o: any) => o.status === "pending_payment").length

  return (
    <PanierClient
      account={account as any}
      profils={(profils || []) as any[]}
      orders={(orders || []) as any[]}
      wallet={wallet as any}
      upcomingSlots={(upcomingSlots || []) as any[]}
      pendingCount={pendingCount}
      catalogItems={(catalogItems || []) as any[]}
      toppings={(toppings || []) as any[]}
    />
  )
}
