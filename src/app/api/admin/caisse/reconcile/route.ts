import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { cashDiffCents } from "@/lib/caisse"

export const dynamic = "force-dynamic"

// POST /api/admin/caisse/reconcile — PS-08a-b. Rapprochement espèces d'une clôture figée.
// Seul mouvement autorisé par le trigger : cash_counted/diff/note/counted_at. On ne touche
// jamais aux montants consolidés (data). { id, cash_counted_cents, cash_note }.
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const body = await req.json().catch(() => ({}))
  const id = body?.id as string
  const counted = Number(body?.cash_counted_cents)
  const note = (body?.cash_note as string | undefined)?.slice(0, 500) ?? null
  if (!id || !Number.isFinite(counted) || counted < 0) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data: row, error: rErr } = await admin
    .from("caisse_clotures").select("cash_expected_cents").eq("id", id).maybeSingle()
  if (rErr || !row) return NextResponse.json({ error: "Clôture introuvable" }, { status: 404 })

  const diff = cashDiffCents(counted, row.cash_expected_cents)
  const { data, error } = await admin
    .from("caisse_clotures")
    .update({
      cash_counted_cents: counted,
      cash_diff_cents: diff,
      cash_note: note,
      cash_counted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle()
  if (error) {
    console.error("[caisse/reconcile]", error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ success: true, cloture: data })
}
