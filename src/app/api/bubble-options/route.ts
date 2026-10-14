import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// PS-23 — Carte des parfums/bubbles pour le parent : options ACTIVES + drapeau « épuisé »
// (doses_restantes < 1). Lecture des mouvements réservée au service_role → on passe par l'admin
// client côté serveur ; la route exige une session parent.
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data } = await admin.from("bubble_stock_estime")
    .select("option_id, kind, name, active, doses_restantes, sort_order")
    .eq("active", true).order("sort_order")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data || []) as any[]
  const map = (kind: string) => rows.filter((r) => r.kind === kind).map((r) => ({
    id: r.option_id, name: r.name, epuise: Number(r.doses_restantes) < 1,
  }))
  return NextResponse.json({ sirops: map("sirop"), perles: map("perles") })
}
