import { createServerSupabase } from "@/lib/supabase/server"
import { Navbar } from "./Navbar"

/**
 * Wrapper async qui fetch user / account / wallet / pending count
 * et délègue le rendu à Navbar (client). À utiliser dans les pages server
 * qui n'ont pas déjà ces infos via leur propre logique de fetch.
 *
 * Pour les pages avec client component qui fetch déjà ces infos,
 * passer directement les props à <Navbar /> côté client.
 */
export async function NavbarServer() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return <Navbar />

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account } = await (supabase as any)
    .from("accounts")
    .select("id, nom_compte")
    .eq("auth_user_id", user.id)
    .single()

  if (!account) return <Navbar />

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: wallet } = await (supabase as any)
    .from("wallets")
    .select("balance_cents, last_recharge_cents")
    .eq("account_id", account.id)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pendingOrders } = await (supabase as any)
    .from("orders")
    .select("id")
    .eq("account_id", account.id)
    .eq("status", "pending_payment")

  const pendingCount = pendingOrders?.length || 0

  return (
    <Navbar
      walletBalance={wallet?.balance_cents}
      familyName={account.nom_compte}
      lastRechargeCents={wallet?.last_recharge_cents}
      pendingCount={pendingCount}
    />
  )
}
