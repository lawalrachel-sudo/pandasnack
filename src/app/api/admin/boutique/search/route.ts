import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// GET /api/admin/boutique/search?q= — profils enfants actifs des comptes NON archivés,
// filtrés par prénom. (Les comptes archivés sont absents de la recherche.)
export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 500 })

  const q = (req.nextUrl.searchParams.get("q") || "").trim()
  if (q.length < 1) return NextResponse.json({ profils: [] })

  const { data } = await admin
    .from("profils")
    .select("id, prenom, classe, account_id, plafond_gouter_cents, accounts!inner(archived_at, nom_compte)")
    .eq("type_profil", "eleve").eq("active", true).is("archived_at", null)
    .ilike("prenom", `%${q}%`)
    .is("accounts.archived_at", null)
    .limit(20)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profils = (data || []).map((p: any) => ({
    id: p.id, prenom: p.prenom, classe: p.classe, account_id: p.account_id,
    plafond_gouter_cents: p.plafond_gouter_cents, parent_nom: p.accounts?.nom_compte || null,
  }))
  return NextResponse.json({ profils })
}
