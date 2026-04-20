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

  // Wallet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: wallet } = await (supabase as any)
    .from("wallets")
    .select("*")
    .eq("account_id", account.id)
    .single()

  // Catalog : catégories + items (toutes, filtrage actif fait côté client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: categories } = await (supabase as any)
    .from("catalog_categories")
    .select("*, catalog_items(*)")
    .order("sort_order")

  // Service slots ouverts à venir, filtrés par source_group du compte
  // Règle : un slot est proposé si target_source_group IS NULL (tous) OU = account.source_group
  const today = new Date().toISOString().split("T")[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: slotsAll } = await (supabase as any)
    .from("service_slots")
    .select("*, delivery_points(*)")
    .eq("active", true)
    .gte("service_date", today)
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
      slots={slots}
    />
  )
}
