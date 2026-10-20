import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// Upsert d'un favori par libellé (index unique sur lower(libelle) → update-or-insert manuel).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertFavori(admin: any, fav: { libelle: string; categorie: string; fournisseur?: string | null; unite?: string | null; quantite_defaut?: number | null }) {
  const { data: ex } = await admin.from("courses_catalogue").select("id").ilike("libelle", fav.libelle).maybeSingle()
  const patch = { categorie: fav.categorie, fournisseur: fav.fournisseur ?? null, unite: fav.unite ?? null, quantite_defaut: fav.quantite_defaut ?? 1, updated_at: new Date().toISOString() }
  if (ex) await admin.from("courses_catalogue").update(patch).eq("id", ex.id)
  else await admin.from("courses_catalogue").insert({ libelle: fav.libelle, ...patch })
}

// PS-25 — Liste de courses par rayon. GET : synchronise les suggestions Bubble Tea puis renvoie le
// tableau actif (suggere + a_acheter + achete non archivé), les retirés (ignore), l'historique 7 j
// (archivé) et le catalogue favoris. POST : actions de l'écran. Règle « Acheté → réassort » = PS-23b.
const SEL = "id, libelle, quantite, unite, source, bubble_option_id, categorie, fournisseur, statut, archived_at, created_at, updated_at"

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  await admin.rpc("courses_sync_bubble")
  const sept = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: all } = await admin.from("courses_items").select(SEL).order("created_at", { ascending: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (all || []) as any[]
  const actifs = rows.filter((r) => r.statut === "suggere" || r.statut === "a_acheter" || (r.statut === "achete" && !r.archived_at))
  const retires = rows.filter((r) => r.statut === "ignore")
  const historique = rows.filter((r) => r.statut === "achete" && r.archived_at && r.archived_at >= sept)

  const { data: cata } = await admin.from("courses_catalogue")
    .select("id, libelle, categorie, fournisseur, unite, quantite_defaut").eq("actif", true).order("categorie")

  return NextResponse.json({ items: actifs, retires, historique, catalogue: cata || [] })
}

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const action = body?.action as string
  const now = new Date().toISOString()

  if (action === "achete") {
    const { error } = await admin.rpc("courses_mark_achete", { p_id: body.id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Favori : une ligne manuel achetée alimente le catalogue (quantité/fournisseur).
    const { data: l } = await admin.from("courses_items").select("libelle, categorie, fournisseur, unite, quantite, source").eq("id", body.id).maybeSingle()
    if (l?.source === "manuel") {
      await upsertFavori(admin, { libelle: l.libelle, categorie: l.categorie, fournisseur: l.fournisseur, unite: l.unite, quantite_defaut: l.quantite })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === "decocher") {
    const { data: l } = await admin.from("courses_items").select("source, bubble_option_id, quantite").eq("id", body.id).maybeSingle()
    const { error } = await admin.from("courses_items").update({ statut: "a_acheter", archived_at: null, updated_at: now }).eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Annulation dans les 5 s d'une ligne auto_bubble → contre-passe le réassort (mouvement inverse).
    if (body.reverse === true && l?.source === "auto_bubble" && l?.bubble_option_id) {
      const { data: opt } = await admin.from("bubble_options").select("dose, kind, conditionnement").eq("id", l.bubble_option_id).maybeSingle()
      const cond = Number(opt?.conditionnement) || (opt?.kind === "sirop" ? 750 : opt?.kind === "perles" ? 3200 : 0)
      const qty = Number(l.quantite || 1) * cond
      if (qty > 0) {
        await admin.from("bubble_stock_mouvements").insert({
          option_id: l.bubble_option_id, qty: -qty, source: "annulation", ref_courses_item_id: body.id, note: "Annulation liste de courses",
        }).then(() => {}, () => {})  // ON CONFLICT ignoré (idempotent)
      }
    }
    return NextResponse.json({ ok: true })
  }

  if (action === "quantite") {
    const q = Math.max(1, Math.round(Number(body.quantite) || 1))
    const { error } = await admin.from("courses_items").update({ quantite: q, updated_at: now }).eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, quantite: q })
  }

  if (action === "retirer") {
    const { error } = await admin.from("courses_items").update({ statut: "ignore", updated_at: now }).eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === "remettre") {
    const patch: Record<string, unknown> = { statut: "a_acheter", archived_at: null, updated_at: now }
    if (body.quantite != null) patch.quantite = Math.max(1, Math.round(Number(body.quantite) || 1))
    const { error } = await admin.from("courses_items").update(patch).eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === "manuel") {
    const libelle = (body.libelle || "").toString().trim()
    const categorie = (body.categorie || "autre").toString()
    if (!libelle) return NextResponse.json({ error: "Libellé requis" }, { status: 400 })
    const q = body.quantite == null || body.quantite === "" ? 1 : Math.max(1, Number(body.quantite))
    const unite = (body.unite || "").toString().trim() || null
    const { error } = await admin.from("courses_items").insert({ libelle, categorie, unite, quantite: q, source: "manuel", statut: "a_acheter" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await upsertFavori(admin, { libelle, categorie, unite, quantite_defaut: q })
    return NextResponse.json({ ok: true })
  }

  if (action === "from_catalogue") {
    const { data: fav } = await admin.from("courses_catalogue").select("*").eq("id", body.catalogue_id).maybeSingle()
    if (!fav) return NextResponse.json({ error: "Favori introuvable" }, { status: 404 })
    const { error } = await admin.from("courses_items").insert({
      libelle: fav.libelle, categorie: fav.categorie, fournisseur: fav.fournisseur, unite: fav.unite,
      quantite: fav.quantite_defaut || 1, source: fav.bubble_option_id ? "auto_bubble" : "manuel",
      bubble_option_id: fav.bubble_option_id, statut: "a_acheter",
    })
    if (error) return NextResponse.json({ error: error.code === "23505" ? "Déjà dans la liste." : error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (action === "terminer") {
    const { error } = await admin.from("courses_items").update({ archived_at: now }).eq("statut", "achete").is("archived_at", null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 })
}
