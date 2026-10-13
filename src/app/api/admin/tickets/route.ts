import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { isCategorie, isMoyen, statutInitial, type LigneInput } from "@/lib/tickets"

export const dynamic = "force-dynamic"

// PS-22 — Capture d'un ticket de courses. GET = liste récente ; POST = enregistre (photo dans le
// bucket privé « tickets », ticket + lignes). Catégorie OBLIGATOIRE. Perso → statut 'exclu' (hors
// dépenses Snack, aucun envoi Pennylane). L'envoi Pennylane et le rapprochement arrivent plus tard
// (jeton PENNYLANE_JUSTIF_TOKEN requis) : cette route n'appelle AUCUN service externe.

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data, error } = await admin
    .from("tickets_achats")
    .select("id, categorie, fournisseur, date_ticket, montant_ttc, moyen_paiement, statut, erreur, photo_path, created_at, tickets_achats_lignes(count)")
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tickets: data || [] })
}

// data:image/jpeg;base64,xxxx → { buffer, ext, contentType } ; null si non exploitable.
function decodePhoto(dataUrl: string | undefined | null) {
  if (!dataUrl) return null
  const m = /^data:(image\/(png|jpe?g|webp|heic|heif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) return null
  const contentType = m[1]
  const ext = contentType.split("/")[1].replace("jpeg", "jpg")
  return { buffer: Buffer.from(m[3], "base64"), ext, contentType }
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
  if (!isCategorie(body?.categorie)) {
    return NextResponse.json({ error: "Catégorie obligatoire (Pro Snack / Pro LTC / Perso)." }, { status: 400 })
  }
  const categorie = body.categorie
  const moyen = isMoyen(body?.moyen_paiement) ? body.moyen_paiement : null

  // Photo (facultative) → bucket privé « tickets ».
  let photoPath: string | null = null
  const decoded = decodePhoto(body?.photoDataUrl)
  if (decoded) {
    const annee = (typeof body?.date_ticket === "string" && body.date_ticket.slice(0, 4)) || String(new Date().getFullYear())
    const objectPath = `${annee}/${crypto.randomUUID()}.${decoded.ext}`
    const { error: upErr } = await admin.storage.from("tickets").upload(
      objectPath,
      new Blob([new Uint8Array(decoded.buffer)], { type: decoded.contentType }),
      { contentType: decoded.contentType, upsert: false },
    )
    if (upErr) return NextResponse.json({ error: `Photo : ${upErr.message}` }, { status: 500 })
    photoPath = objectPath
  }

  const montant = body?.montant_ttc == null || body.montant_ttc === "" ? null : Number(body.montant_ttc)
  const { data: ticket, error: tErr } = await admin.from("tickets_achats").insert({
    photo_path: photoPath,
    categorie,
    fournisseur: body?.fournisseur?.toString().trim() || null,
    date_ticket: body?.date_ticket || null,
    montant_ttc: Number.isFinite(montant as number) ? montant : null,
    moyen_paiement: moyen,
    statut: statutInitial(categorie),
  }).select("id").single()
  if (tErr || !ticket) return NextResponse.json({ error: tErr?.message || "Échec enregistrement" }, { status: 500 })

  const lignes: LigneInput[] = Array.isArray(body?.lignes) ? body.lignes : []
  const rows = lignes
    .filter((l) => (l?.article && l.article.toString().trim()) || l?.prix_ttc != null)
    .map((l) => ({
      ticket_id: ticket.id,
      article: l.article?.toString().trim() || null,
      quantite: l.quantite == null || (l.quantite as unknown) === "" ? null : Number(l.quantite),
      unite: l.unite?.toString().trim() || null,
      prix_ttc: l.prix_ttc == null || (l.prix_ttc as unknown) === "" ? null : Number(l.prix_ttc),
      taux_tva: l.taux_tva == null || (l.taux_tva as unknown) === "" ? null : Number(l.taux_tva),
    }))
  if (rows.length > 0) {
    const { error: lErr } = await admin.from("tickets_achats_lignes").insert(rows)
    if (lErr) return NextResponse.json({ error: `Lignes : ${lErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: ticket.id, statut: statutInitial(categorie), lignes: rows.length })
}
