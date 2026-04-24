import { createServerSupabase as createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { MonEspaceClient } from "./MonEspaceClient"

export default async function MonEspacePage() {
  const supabase: any = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion")

  const { data: account } = await supabase
    .from("accounts")
    .select("id, nom_compte, email, telephone, source_group, source_detail")
    .eq("auth_user_id", user.id)
    .single()
  if (!account) redirect("/onboarding")

  const { data: profils } = await supabase
    .from("profils")
    .select("id, prenom, classe, is_default, active, notes_allergies")
    .eq("account_id", account.id)
    .order("is_default", { ascending: false })
    .order("created_at")

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, balance_cents, total_credited_cents, total_debited_cents")
    .eq("account_id", account.id)
    .single()

  const { data: walletTx } = await supabase
    .from("wallet_transactions")
    .select("id, type, amount_cents, balance_after_cents, description, created_at")
    .eq("wallet_id", wallet?.id || "00000000-0000-0000-0000-000000000000")
    .order("created_at", { ascending: false })
    .limit(20)

  const { count: orderCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id)
    .eq("status", "paid")

  return (
    <MonEspaceClient
      account={account as any}
      profils={(profils || []) as any[]}
      wallet={wallet as any}
      walletTransactions={(walletTx || []) as any[]}
      orderCount={orderCount || 0}
      userEmail={user.email || ""}
    />
  )
}
