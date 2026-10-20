import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { articlesDus } from "@/lib/courses-liste"
import { martiniqueToday } from "@/lib/caisse-date"
import { cocherCourse, annulerCoche } from "@/lib/courses-server"

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
const SEL = "id, libelle, quantite, unite, source, bubble_option_id, categorie, fournisseur, statut, archived_at, created_at, updated_at, coche_at, catalogue_id, courses_catalogue(quantite_texte)"
const OUVERT = (r: { statut: string; archived_at: string | null }) => r.statut === "suggere" || r.statut === "a_acheter" || (r.statut === "achete" && !r.archived_at)

// Échappe % et _ pour une comparaison ilike exacte (insensible à la casse).
const exact = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c)

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
  const rows = ((all || []) as any[]).map(({ courses_catalogue: c, ...r }) => ({ ...r, quantite_texte: c?.quantite_texte ?? null }))
  const actifs = rows.filter(OUVERT)
  const retires = rows.filter((r) => r.statut === "ignore")
  const historique = rows.filter((r) => r.statut === "achete" && r.archived_at && r.archived_at >= sept)

  const { data: cata } = await admin.from("courses_catalogue")
    .select("id, libelle, categorie, fournisseur, unite, quantite_defaut, cadence, dernier_achat, quantite_texte").eq("actif", true).order("categorie")

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
    // PS-28 : coche_at + dernier_achat du catalogue (Martinique).
    const { error } = await cocherCourse(admin, body.id)
    if (error) return NextResponse.json({ error }, { status: 500 })
    // Favori : une ligne manuel (hors catalogue) achetée alimente le catalogue (quantité/fournisseur).
    const { data: l } = await admin.from("courses_items").select("libelle, categorie, fournisseur, unite, quantite, source, catalogue_id").eq("id", body.id).maybeSingle()
    if (l?.source === "manuel" && !l.catalogue_id) {
      await upsertFavori(admin, { libelle: l.libelle, categorie: l.categorie, fournisseur: l.fournisseur, unite: l.unite, quantite_defaut: l.quantite })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === "decocher") {
    const { data: l } = await admin.from("courses_items").select("source, bubble_option_id, quantite").eq("id", body.id).maybeSingle()
    await annulerCoche(admin, body.id)
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
    await annulerCoche(admin, body.id)
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
      bubble_option_id: fav.bubble_option_id, catalogue_id: fav.id, statut: "a_acheter",
    })
    if (error) return NextResponse.json({ error: error.code === "23505" ? "Déjà dans la liste." : error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // PS-28 — « Préparer la liste » : ajoute les articles dus du catalogue (cadence), sans doublon.
  if (action === "preparer") {
    const { data: cata, error: e1 } = await admin.from("courses_catalogue")
      .select("id, libelle, categorie, fournisseur, unite, quantite_defaut, bubble_option_id, actif, cadence, dernier_achat").eq("actif", true)
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
    const { data: ouverts } = await admin.from("courses_items").select("catalogue_id, bubble_option_id, statut, archived_at")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const open = ((ouverts || []) as any[]).filter(OUVERT)
    const deja = new Set<string>(open.map((r) => r.catalogue_id).filter(Boolean))
    // Une seule ligne ouverte par option Bubble Tea (index courses_open_option_uidx).
    const bubbles = new Set(open.map((r) => r.bubble_option_id).filter(Boolean))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (cata || []) as any[]) if (c.bubble_option_id && bubbles.has(c.bubble_option_id)) deja.add(c.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dus = articlesDus((cata || []) as any[], martiniqueToday(), deja)
    if (dus.length > 0) {
      const { error } = await admin.from("courses_items").insert(dus.map((c) => ({
        libelle: c.libelle, categorie: c.categorie, fournisseur: c.fournisseur, unite: c.unite,
        quantite: c.quantite_defaut || 1, catalogue_id: c.id, bubble_option_id: c.bubble_option_id,
        source: c.bubble_option_id ? "auto_bubble" : "catalogue", statut: "a_acheter",
      })))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, ajoutes: dus.length })
  }

  // PS-28 — Ajout manuel dans un rayon : lié au catalogue si le libellé existe, sinon entrée créée (ponctuel).
  if (action === "ajouter") {
    const libelle = (body.libelle || "").toString().trim()
    const categorie = (body.categorie || "autre").toString()
    if (!libelle) return NextResponse.json({ error: "Libellé requis" }, { status: 400 })
    let { data: fav } = await admin.from("courses_catalogue").select("id, libelle, fournisseur, unite, bubble_option_id").ilike("libelle", exact(libelle)).maybeSingle()
    if (!fav) {
      const { data: cree, error } = await admin.from("courses_catalogue")
        .insert({ libelle, categorie, fournisseur: "Carrefour", quantite_defaut: 1, cadence: "ponctuel" })
        .select("id, libelle, fournisseur, unite, bubble_option_id").single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      fav = cree
    } else {
      const { data: ex } = await admin.from("courses_items").select("id, statut, archived_at").eq("catalogue_id", fav.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (((ex || []) as any[]).some(OUVERT)) return NextResponse.json({ error: "Déjà dans la liste." }, { status: 400 })
    }
    const { error } = await admin.from("courses_items").insert({
      libelle: fav.libelle, categorie, fournisseur: fav.fournisseur || "Carrefour", unite: fav.unite, quantite: 1,
      catalogue_id: fav.id, bubble_option_id: fav.bubble_option_id, source: fav.bubble_option_id ? "auto_bubble" : "manuel", statut: "a_acheter",
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
