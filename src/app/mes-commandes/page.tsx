import { createServerSupabase as createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { MesCommandesClient } from "./MesCommandesClient"

export default async function MesCommandesPage() {
  const supabase: any = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion")

  const { data: account } = await supabase
    .from("accounts")
    .select("id, nom_compte")
    .eq("auth_user_id", user.id)
    .single()
  if (!account) redirect("/onboarding")

  // Récupérer les profils
  const { data: profils } = await supabase
    .from("profils")
    .select("id, prenom, classe, is_default, active")
    .eq("account_id", account.id)
    .eq("active", true)
    .order("is_default", { ascending: false })

  // Récupérer les commandes (60 derniers jours)
  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  const { data: orders } = await supabase
    .from("orders")
    .select(`
      id, order_number, status, total_cents, payment_method, created_at, paid_at, special_request,
      service_slots!inner(service_date, day_type, delivery_points(name)),
      order_items(id, notes, quantity, unit_price_cents, line_total_cents, takeaway, profil_id, prenom_libre, profils(prenom))
    `)
    .eq("account_id", account.id)
    .gte("created_at", sixtyDaysAgo.toISOString())
    .order("created_at", { ascending: false })

  // Récupérer le wallet
  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance_cents")
    .eq("account_id", account.id)
    .single()

  // Récupérer les slots à venir pour le mini calendrier
  const today = new Date().toISOString().split("T")[0]
  const { data: upcomingSlots } = await supabase
    .from("service_slots")
    .select("id, service_date, day_type")
    .eq("active", true)
    .gte("service_date", today)
    .order("service_date")
    .limit(30)

  return (
    <MesCommandesClient
      account={account as any}
      profils={(profils || []) as any[]}
      orders={(orders || []) as any[]}
      wallet={wallet as any}
      upcomingSlots={(upcomingSlots || []) as any[]}
    />
  )
}
