import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CommanderClient } from "./CommanderClient"

export const dynamic = "force-dynamic"

export default async function CommanderPage() {
  const supabase = await createServerSupabase()

  // Auth
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth")

  // Account + profils (multi-profils)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account } = await (supabase as any)
    .from("accounts")
    .select("*, profils(*)")
    .eq("auth_user_id", user.id)
    .single()

  if (!account) redirect("/auth?error=no_account")

  // Wallet (* inclut last_recharge_cents pour le pricing futur)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: wallet } = await (supabase as any)
    .from("wallets")
    .select("*")
    .eq("account_id", account.id)
    .single()

  // FIX 1 + FIX 4 — commandes pending pour bandeau + total semaine
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pendingOrders } = await (supabase as any)
    .from("orders")
    .select("id, total_cents, service_slots!inner(service_date), order_items(id)")
    .eq("account_id", account.id)
    .eq("status", "pending_payment")

  const pendingCount = pendingOrders?.length || 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingTotalCents = (pendingOrders || []).reduce(
    (sum: number, o: any) => sum + (o.total_cents || 0),
    0
  )

  // FIX 4 — semaine ISO courante (lundi -> dimanche)
  const todayDt = new Date()
  const dow = todayDt.getDay()
  const daysFromMonday = dow === 0 ? 6 : dow - 1
  const mondayDate = new Date(todayDt)
  mondayDate.setDate(todayDt.getDate() - daysFromMonday)
  const sundayDate = new Date(mondayDate)
  sundayDate.setDate(mondayDate.getDate() + 6)
  const mondayStr = mondayDate.toISOString().split("T")[0]
  const sundayStr = sundayDate.toISOString().split("T")[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weekOrders = (pendingOrders || []).filter((o: any) => {
    const sd = o.service_slots?.service_date
    return sd && sd >= mondayStr && sd <= sundayStr
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weekItemCount = weekOrders.reduce((s: number, o: any) => s + (o.order_items?.length || 0), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weekTotalCents = weekOrders.reduce((s: number, o: any) => s + (o.total_cents || 0), 0)

  // Catalog : catégories + items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: categories } = await (supabase as any)
    .from("catalog_categories")
    .select("*, catalog_items(*)")
    .order("sort_order")

  // Menu formulas (bentos, menus, coffrets)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: menuFormulas } = await (supabase as any)
    .from("menu_formulas")
    .select("*")
    .eq("active", true)
    .order("sort_order")

  // Toppings (garnitures/sauces)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: toppings } = await (supabase as any)
    .from("toppings")
    .select("*")
    .eq("active", true)
    .order("sort_order")

  // Service slots ouverts à venir, filtrés par source_group du compte
  // FIX BUG 20: on filtre orders_cutoff_at > maintenant (pas juste service_date >= today)
  const now = new Date().toISOString()
  const today = now.split("T")[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: slotsAll } = await (supabase as any)
    .from("service_slots")
    .select("*, delivery_points(*)")
    .eq("active", true)
    .gte("service_date", today)
    .gt("orders_cutoff_at", now)
    .order("service_date")
    .limit(30)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slots = (slotsAll || []).filter((s: any) => {
    if (!s.target_source_group) return true
    return s.target_source_group === account.source_group
  })

  return (
    <CommanderClient
      account={account}
      profils={account.profils || []}
      wallet={wallet}
      categories={categories || []}
      menuFormulas={menuFormulas || []}
      toppings={toppings || []}
      slots={slots}
      pendingCount={pendingCount}
      pendingTotalCents={pendingTotalCents}
      weekItemCount={weekItemCount}
      weekTotalCents={weekTotalCents}
    />
  )
}
