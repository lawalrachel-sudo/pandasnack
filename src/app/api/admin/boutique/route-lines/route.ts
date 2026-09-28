import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// GET /api/admin/boutique/route-lines?date=YYYY-MM-DD — PS-08a-e.
// Lignes comptoir d'un jour de SERVICE (consommation) pour la Feuille de route :
// ventes non contre-passées, is_test exclu. + totaux par article/variante.
export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const date = req.nextUrl.searchParams.get("date") || ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date invalide" }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data: rows, error } = await admin
    .from("comptoir_sales")
    .select("id, prenom, profil_id, payment_mode, jeton_qty, items, reverses_sale_id, is_test, created_at")
    .eq("service_date", date).eq("is_test", false).order("created_at", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (rows || []) as any[]
  // Contre-passations : on retire les annulations ET les originaux annulés.
  const reversedIds = new Set(all.filter((r) => r.reverses_sale_id).map((r) => r.reverses_sale_id as string))
  const kept = all.filter((r) => !r.reverses_sale_id && !reversedIds.has(r.id))

  const lines = kept.map((r) => ({
    id: r.id,
    prenom: r.prenom as string | null,
    profil_id: r.profil_id as string | null,
    payment_mode: r.payment_mode as string,
    jeton_qty: r.jeton_qty as number | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (Array.isArray(r.items) ? r.items : []).map((it: any) => ({ name: it.name as string, qty: Number(it.qty) || 0 })),
  }))

  // Totaux par article/variante (nom = « Parent · Variante »).
  const totalsMap = new Map<string, number>()
  for (const l of lines) for (const it of l.items) totalsMap.set(it.name, (totalsMap.get(it.name) || 0) + it.qty)
  const totals = [...totalsMap.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty)

  return NextResponse.json({ date, lines, totals })
}
