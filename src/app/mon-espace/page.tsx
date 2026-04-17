import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { MonEspaceClient } from "./MonEspaceClient"

export default async function MonEspacePage() {
  const supabase = await createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: family } = await sb
    .from("families")
    .select("*, beneficiaries(*)")
    .eq("auth_user_id", user.id)
    .single()

  if (!family) redirect("/auth?error=no_family")

  const { data: wallet } = await sb
    .from("wallets")
    .select("*")
    .eq("family_id", family.id)
    .single()

  // Recent transactions
  const { data: transactions } = wallet
    ? await sb
        .from("wallet_transactions")
        .select("*")
        .eq("wallet_id", wallet.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] }

  // Recent orders
  const { data: orders } = await sb
    .from("orders")
    .select("*, order_items(*, catalog_items(name))")
    .eq("family_id", family.id)
    .order("created_at", { ascending: false })
    .limit(10)

  return (
    <MonEspaceClient
      family={family}
      wallet={wallet}
      transactions={transactions || []}
      orders={orders || []}
    />
  )
}
