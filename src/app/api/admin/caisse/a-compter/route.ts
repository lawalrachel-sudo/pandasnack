import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { aCompter, especesDuJour } from "@/lib/caisse-compter"

export const dynamic = "force-dynamic"

// PS-24 — Clôtures jour à rapprocher (espèces non comptées). Plus ancienne d'abord. Alimente le
// badge « N à compter » (accueil + /admin/caisse) et l'écran /admin/caisse/compter.
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data, error } = await admin
    .from("caisse_clotures")
    .select("id, period_type, period_start, cash_expected_cents, cash_counted_at, data")
    .eq("period_type", "jour").is("cash_counted_at", null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jours = aCompter((data || []) as any[]).map((c: any) => {
    const esp = especesDuJour(c.data)
    return {
      id: c.id, date: c.period_start, cash_expected_cents: c.cash_expected_cents,
      especes_total_cents: esp.total_cents, comptoir_nb: esp.comptoir_nb,
    }
  })
  return NextResponse.json({ count: jours.length, jours })
}
