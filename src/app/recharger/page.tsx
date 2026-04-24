import { createServerSupabase as createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { RechargerClient } from "./RechargerClient"

export default async function RechargerPage() {
  const supabase: any = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion")

  const { data: account } = await supabase
    .from("accounts")
    .select("id, nom_compte")
    .eq("auth_user_id", user.id)
    .single()
  if (!account) redirect("/onboarding")

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, balance_cents")
    .eq("account_id", account.id)
    .single()

  // Get active recharge configs
  const { data: configs } = await supabase
    .from("wallet_recharge_config")
    .select("id, amount_cents, bonus_cents, label, active")
    .eq("active", true)
    .order("amount_cents")

  return (
    <RechargerClient
      accountId={account.id}
      familyName={account.nom_compte}
      walletBalance={wallet?.balance_cents || 0}
      configs={(configs || []) as any[]}
    />
  )
}
