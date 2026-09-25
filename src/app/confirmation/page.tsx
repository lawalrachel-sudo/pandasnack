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

  // PS-05c — cette page est en LECTURE SEULE.
  //
  // Elle passait auparavant une commande en `paid` à partir du seul `?session_id=` de
  // l'URL, sans rien vérifier auprès de Stripe : revenir sur l'URL de succès après avoir
  // abandonné le paiement suffisait à obtenir une commande payée (audit PS-05).
  // Le webhook Stripe (`/api/stripe/webhook`, signature vérifiée) est désormais la seule
  // source d'un passage à `paid`. Si le webhook n'est pas encore arrivé, la page affiche
  // simplement « en attente de paiement ».

  const { data: account } = await supabase
    .from("accounts").select("id").eq("auth_user_id", user.id).maybeSingle()
  if (!account) redirect("/onboarding")

  // Récupérer la commande + items — bornée au compte connecté : un id de commande
  // appartenant à un autre parent ne doit rien révéler.
  const { data: order } = await supabase
    .from("orders")
    .select(`
      id, account_id, order_number, status, total_cents, subtotal_cents, vat_cents,
      payment_method, created_at, paid_at,
      service_slots!inner(service_date, day_type, delivery_points(name))
    `)
    .eq("id", orderId)
    .eq("account_id", account.id)
    .maybeSingle()

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
