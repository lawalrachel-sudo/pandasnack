import { createClient } from "@/lib/supabase/server"
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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion")

  // Si Stripe session_id présent, confirmer le paiement
  if (params.session_id && params.session_id !== "SIMULATED_TEST") {
    await supabase.from("orders").update({
      status: "paid",
      paid_at: new Date().toISOString(),
    }).eq("id", orderId).eq("status", "pending_payment")
  }

  // Récupérer la commande + items
  const { data: order } = await supabase
    .from("orders")
    .select(`
      id, order_number, status, total_cents, subtotal_cents, vat_cents, 
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

  return <ConfirmationClient order={order as any} items={(items || []) as any[]} />
}
