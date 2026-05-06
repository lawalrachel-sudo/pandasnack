import { createServerSupabase as createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ConfirmationClient } from "./ConfirmationClient"

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; session_id?: string }>
}) {
  const params = await searchParams
  const orderId = params.order
  if (!orderId) redirect("/commander")

  const supabase: any = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion")

  // Niveau 1 fix multi-checkout : marquer TOUTES les orders rattachées à cette session
  // paid (pas juste celle dans ?order=). En multi, la session Stripe couvre N orders mais
  // success_url ne référence qu'une (firstOrderId) — sans ce filtre par session_id, les N-1
  // autres restaient pending alors que Stripe avait bien encaissé l'intégralité.
  // Idempotence garantie par .eq("status","pending_payment") : un refresh ne re-trigge rien.
  if (params.session_id && params.session_id !== "SIMULATED_TEST" && params.session_id !== "SIMULATED_TEST_MULTI") {
    await supabase.from("orders").update({
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .eq("stripe_checkout_session_id", params.session_id)
    .eq("status", "pending_payment")
  }

  // Récupérer la commande + items
  const { data: order } = await supabase
    .from("orders")
    .select(`
      id, account_id, order_number, status, total_cents, subtotal_cents, vat_cents,
      payment_method, created_at, paid_at,
      service_slots!inner(service_date, day_type, delivery_points(name))
    `)
    .eq("id", orderId)
    .single()

  if (!order) redirect("/commander")

  const { data: items } = await supabase
    .from("order_items")
    .select("id, notes, quantity, unit_price_cents, line_total_cents, takeaway, profil_id, prenom_libre, profils(prenom)")
    .eq("order_id", orderId)
    .order("created_at")

  // FIX 3 — chaînage : autres commandes pending_payment du même compte
  const { data: nextPendingList } = await supabase
    .from("orders")
    .select("id")
    .eq("account_id", order.account_id)
    .eq("status", "pending_payment")
    .neq("id", orderId)
    .order("created_at", { ascending: true })

  const remainingPendingCount = nextPendingList?.length || 0
  const nextPendingOrderId = nextPendingList?.[0]?.id || null

  return (
    <ConfirmationClient
      order={order as any}
      items={(items || []) as any[]}
      remainingPendingCount={remainingPendingCount}
      nextPendingOrderId={nextPendingOrderId}
    />
  )
}
