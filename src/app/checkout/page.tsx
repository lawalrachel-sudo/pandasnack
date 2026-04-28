import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CheckoutClient } from "./CheckoutClient"

export const dynamic = "force-dynamic"

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; cancelled?: string }>
}) {
  const params = await searchParams
  const orderId = params.order
  if (!orderId) redirect("/commander")

  const wasCancelled = params.cancelled === "1"

  const supabase = await createServerSupabase()

  // Auth
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // Account (no email — not used in checkout view)
  const { data: account } = await sb
    .from("accounts")
    .select("id, nom_compte, source_group")
    .eq("auth_user_id", user.id)
    .single()

  if (!account) redirect("/auth?error=no_account")

  // Wallet (with last_recharge_cents for tier label)
  const { data: wallet } = await sb
    .from("wallets")
    .select("id, balance_cents, last_recharge_cents")
    .eq("account_id", account.id)
    .single()

  // Order + items + slot — RLS: orders_self_select handles ownership
  const { data: order } = await sb
    .from("orders")
    .select(`
      id, order_number, status, subtotal_cents, vat_rate, vat_cents, total_cents,
      payment_method, special_request, created_at,
      service_slots!inner(id, service_date, day_type, orders_cutoff_at, delivery_points(id, name, address, delivery_time_local))
    `)
    .eq("id", orderId)
    .eq("account_id", account.id)
    .single()

  if (!order) redirect("/commander")

  // Only allow checkout on pending_payment orders
  if (order.status !== "pending_payment") {
    if (order.status === "paid") {
      redirect(`/confirmation?order=${order.id}`)
    }
    redirect("/panier")
  }

  // Order items with profil info (formula_choices + topping names for display)
  const { data: items } = await sb
    .from("order_items")
    .select(`
      id, catalog_item_id, menu_formula_id, formula_choices,
      topping_ids, quantity, unit_price_cents, line_total_cents, takeaway,
      profil_id, prenom_libre, notes,
      profils(id, prenom, classe)
    `)
    .eq("order_id", order.id)
    .order("created_at")

  // Resolve topping names for display (single batch query if any toppings present)
  const allToppingIds = new Set<string>()
  for (const it of items || []) {
    if (Array.isArray(it.topping_ids)) {
      for (const tid of it.topping_ids) allToppingIds.add(tid)
    }
  }

  let toppingsMap: Record<string, string> = {}
  if (allToppingIds.size > 0) {
    const { data: tops } = await sb
      .from("toppings")
      .select("id, name")
      .in("id", Array.from(allToppingIds))
    toppingsMap = Object.fromEntries((tops || []).map((t: { id: string; name: string }) => [t.id, t.name]))
  }

  // Check cutoff
  const cutoffPassed = order.service_slots?.orders_cutoff_at
    ? new Date() >= new Date(order.service_slots.orders_cutoff_at)
    : false

  // CHANTIER B — pending count pour caddie navbar
  const { data: pendingOrders } = await sb
    .from("orders")
    .select("id")
    .eq("account_id", account.id)
    .eq("status", "pending_payment")
  const pendingCount = pendingOrders?.length || 0

  return (
    <CheckoutClient
      order={order}
      items={items || []}
      wallet={wallet}
      account={account}
      cutoffPassed={cutoffPassed}
      wasCancelled={wasCancelled}
      toppingsMap={toppingsMap}
      pendingCount={pendingCount}
    />
  )
}
