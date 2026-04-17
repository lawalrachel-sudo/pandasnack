import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CommanderClient } from "./CommanderClient"

export default async function CommanderPage() {
  const supabase = await createServerSupabase()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth")

  // Get family
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: family } = await (supabase as any)
    .from("families")
    .select("*, beneficiaries(*)")
    .eq("auth_user_id", user.id)
    .single()

  if (!family) redirect("/auth?error=no_family")

  // Get wallet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: wallet } = await (supabase as any)
    .from("wallets")
    .select("*")
    .eq("family_id", family.id)
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
      family={family}
      beneficiaries={family.beneficiaries || []}
      wallet={wallet}
      categories={categories || []}
      slots={slots || []}
    />
  )
}
