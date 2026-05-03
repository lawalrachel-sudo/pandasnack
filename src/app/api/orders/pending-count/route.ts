import { NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"

// GET /api/orders/pending-count — Brief 3-E B-α : retourne le nombre d'order_items pending pour le badge BottomNav
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0 }, { status: 200 })

  const { data: account } = await supabase
    .from("accounts").select("id").eq("auth_user_id", user.id).single()
  if (!account) return NextResponse.json({ count: 0 }, { status: 200 })

  // Count order_items dans les orders pending_payment du compte
  const { data: pendingOrders } = await supabase
    .from("orders")
    .select("id, order_items(id)")
    .eq("account_id", account.id)
    .eq("status", "pending_payment")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalItems = (pendingOrders || []).reduce((s: number, o: any) => s + (o.order_items?.length || 0), 0)
  const orderCount = pendingOrders?.length || 0

  return NextResponse.json({ count: totalItems, orderCount })
}
