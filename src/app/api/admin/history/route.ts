import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// GET /api/admin/history — PS-06b §12 : historique minimal pour la compta.
// CA `paid` par service (pandattitude), comptes test exclus. Le détail caisse vient en PS-08.
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant" }, { status: 500 })

  const { data, error } = await admin
    .from("orders")
    .select("total_cents, status, service_slots!inner(service_date, target_source_group), accounts!inner(is_test)")
    .eq("status", "paid")
    .eq("service_slots.target_source_group", "pandattitude")
  if (error) {
    console.error("[admin/history]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const byDate = new Map<string, { revenue_cents: number; orders: number }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (data || []) as any[]) {
    if (o.accounts?.is_test) continue
    const d = o.service_slots?.service_date
    if (!d) continue
    const e = byDate.get(d) || { revenue_cents: 0, orders: 0 }
    e.revenue_cents += o.total_cents || 0
    e.orders += 1
    byDate.set(d, e)
  }

  const services = [...byDate.entries()]
    .map(([service_date, v]) => ({ service_date, ...v }))
    .sort((a, b) => b.service_date.localeCompare(a.service_date))

  const total_cents = services.reduce((s, x) => s + x.revenue_cents, 0)
  return NextResponse.json({ services, total_cents })
}
