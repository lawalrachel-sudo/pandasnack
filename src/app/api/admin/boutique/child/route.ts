import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { martiniqueToday } from "@/lib/caisse-date"

export const dynamic = "force-dynamic"

// GET /api/admin/boutique/child?profilId=&date= — contexte d'un enfant pour le bandeau :
// solde wallet, plafond du jour, consommé wallet du jour (net des contre-passées).
export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 500 })

  const profilId = req.nextUrl.searchParams.get("profilId")
  const date = req.nextUrl.searchParams.get("date") || martiniqueToday()
  if (!profilId) return NextResponse.json({ error: "profilId requis" }, { status: 400 })

  const { data: profil } = await admin
    .from("profils").select("id, prenom, classe, account_id, plafond_gouter_cents").eq("id", profilId).maybeSingle()
  if (!profil) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 })

  const { data: wallet } = await admin
    .from("wallets").select("balance_cents").eq("account_id", profil.account_id).maybeSingle()

  const { data: sales } = await admin
    .from("comptoir_sales").select("total_cents")
    .eq("profil_id", profilId).eq("service_date", date).eq("payment_mode", "wallet")
  const consumed = (sales || []).reduce((s: number, r: { total_cents: number }) => s + (r.total_cents || 0), 0)

  return NextResponse.json({
    profil_id: profil.id,
    prenom: profil.prenom,
    classe: profil.classe,
    account_id: profil.account_id,
    balance_cents: wallet?.balance_cents ?? 0,
    plafond_gouter_cents: profil.plafond_gouter_cents,
    consumed_cents: consumed,
  })
}
