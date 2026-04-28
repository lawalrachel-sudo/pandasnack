import { createServerSupabase as createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { RechargerClient } from "./RechargerClient"

export default async function RechargerPage() {
  const supabase: any = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth")  // FIX BUG 2: était /connexion (n'existe pas)

  const { data: account } = await supabase
    .from("accounts")
    .select("id, nom_compte")
    .eq("auth_user_id", user.id)
    .single()
  if (!account) redirect("/onboarding")

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, balance_cents, last_recharge_cents")
    .eq("account_id", account.id)
    .single()

  // FIX BUG 13: la table wallet_recharge_config a "recharge_cents" comme PK, pas "id" ni "amount_cents"
  const { data: configs } = await supabase
    .from("wallet_recharge_config")
    .select("recharge_cents, bonus_cents, total_credit_cents, label, bonus_label, active")
    .eq("active", true)
    .order("sort_order")

  // Déterminer le palier actuel pour l'affichage
  const lastRecharge = wallet?.last_recharge_cents || 0
  const currentMenuPrice = lastRecharge >= 10000 ? 800 : lastRecharge >= 5000 ? 900 : 1000

  // CHANTIER B — pending count pour caddie navbar
  const { count: pendingCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id)
    .eq("status", "pending_payment")

  return (
    <RechargerClient
      accountId={account.id}
      familyName={account.nom_compte}
      walletBalance={wallet?.balance_cents || 0}
      configs={(configs || []) as any[]}
      currentMenuPriceCents={currentMenuPrice}
      lastRechargeCents={lastRecharge}
      pendingCount={pendingCount || 0}
    />
  )
}
