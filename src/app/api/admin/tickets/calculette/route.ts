import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { buildFiche, type ArticlePrix, type CalcFiche } from "@/lib/calculette-export"

export const dynamic = "force-dynamic"

// PS-22 §5 — POST /api/admin/tickets/calculette : fusionne les prix réels des tickets pro_snack dans
// la fiche calculette existante (recettes + ids conservés). Body { fiche } = l'export actuel de la
// calculette (onglet 📤 Export). Renvoie la fiche fusionnée + articles ajoutés + alertes écart >10 %.
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const fiche = (body?.fiche as CalcFiche | null) ?? null

  // Lignes des tickets pro_snack, avec leur date (prix le plus récent par article côté lib).
  const { data, error } = await admin
    .from("tickets_achats_lignes")
    .select("article, prix_ttc, quantite, unite, tickets_achats!inner(categorie, fournisseur, date_ticket)")
    .eq("tickets_achats.categorie", "pro_snack")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lignes: ArticlePrix[] = (data || []).map((r: any) => ({
    article: r.article,
    prix_ttc: r.prix_ttc == null ? null : Number(r.prix_ttc),
    quantite: r.quantite == null ? null : Number(r.quantite),
    unite: r.unite,
    fournisseur: r.tickets_achats?.fournisseur ?? null,
    date: r.tickets_achats?.date_ticket ?? null,
  })).filter((l: ArticlePrix) => l.article && l.prix_ttc != null)

  const { fiche: merged, ajoutes, alertes } = buildFiche(fiche, lignes)
  return NextResponse.json({ fiche: merged, ajoutes, alertes })
}
