import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CommanderClient } from "./CommanderClient"

export default async function CommanderPage() {
  const supabase = await createServerSupabase()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth")

  // Get account (ex-family) with its profils (ex-beneficiaries)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account } = await (supabase as any)
    .from("accounts")
    .select("*, profils(*)")
    .eq("auth_user_id", user.id)
    .single()

  if (!account) redirect("/auth?error=no_account")

  // Get wallet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: wallet } = await (supabase as any)
    .from("wallets")
    .select("*")
    .eq("account_id", account.id)
    .single()

  // Get catalog (active items only, sorted)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: categories } = await (supabase as any)
    .from("catalog_categories")
    .select("*, catalog_items(*)")
    .order("sort_order")

  // Get open service slots (upcoming)
  const today = new Date().toISOString().split("T")[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: slots } = await (supabase as any)
    .from("service_slots")
    .select("*")
    .eq("is_open", true)
    .gte("slot_date", today)
    .order("slot_date")
    .limit(10)

  return (
    <CommanderClient
      family={account}
      beneficiaries={account.profils || []}
      wallet={wallet}
      categories={categories || []}
      slots={slots || []}
    />
  )
}
