import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { parisToday, addDays } from "@/lib/caisse-date"

export const dynamic = "force-dynamic"

// GET /api/admin/caisse — PS-08a-b. Z du jour (live, non figé), liste des clôtures,
// et analytique 7j/30j. Lecture seule : aucune écriture d'argent.
export async function GET(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const url = new URL(req.url)
  const typeFilter = url.searchParams.get("type") // jour|mois|annee|null
  const today = parisToday()

  const [zToday, z7, z30] = await Promise.all([
    admin.rpc("caisse_z", { p_start: today, p_end: today }),
    admin.rpc("caisse_z", { p_start: addDays(today, -6), p_end: today }),
    admin.rpc("caisse_z", { p_start: addDays(today, -29), p_end: today }),
  ])
  if (zToday.error) return NextResponse.json({ error: zToday.error.message }, { status: 500 })

  let q = admin.from("caisse_clotures").select("*").order("period_start", { ascending: false }).limit(60)
  if (typeFilter) q = q.eq("period_type", typeFilter)
  const { data: clotures, error: cErr } = await q
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  const closedToday = (clotures || []).some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) => c.period_type === "jour" && c.period_start === today,
  )

  return NextResponse.json({
    today,
    z_today: zToday.data,
    is_closed: closedToday,
    clotures: clotures || [],
    analytics: { j7: z7.data ?? null, j30: z30.data ?? null },
  })
}
