import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { getSaKiNiAdminPanel } from "@/lib/sa-ki-ni-server"

export const dynamic = "force-dynamic"

// GET /api/admin/sa-ki-ni?date=YYYY-MM-DD — plats sa_ki_ni_ok présents dans les commandes du jour
// + état des offres (ouvertes / prises). Utilisable de la clôture (veille 20h) à 10h30 le jour J.
export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const date = req.nextUrl.searchParams.get("date")
  if (!date) return NextResponse.json({ error: "date requise (YYYY-MM-DD)" }, { status: 400 })
  return NextResponse.json(await getSaKiNiAdminPanel(admin, date))
}

// POST /api/admin/sa-ki-ni  body: { slotId, offers: [{ catalog_item_id, qty_ouverte }] }
// Enregistre les portions « en plus ». qty 0 = fermer (supprime si rien de vendu, sinon borne à
// qty_vendue). Jamais en dessous de ce qui est déjà pris.
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const body = await req.json().catch(() => null)
  const slotId: string | undefined = body?.slotId
  const offers: Array<{ catalog_item_id: string; qty_ouverte: number }> = Array.isArray(body?.offers) ? body.offers : []
  if (!slotId) return NextResponse.json({ error: "slotId requis" }, { status: 400 })

  for (const o of offers) {
    if (!o.catalog_item_id) continue
    const desired = Math.max(0, Math.floor(Number(o.qty_ouverte) || 0))
    const { data: existing } = await admin.from("sa_ki_ni_offres")
      .select("id, qty_vendue").eq("service_slot_id", slotId).eq("catalog_item_id", o.catalog_item_id).maybeSingle()
    const sold = existing?.qty_vendue || 0

    if (desired <= 0) {
      if (!existing) continue
      if (sold === 0) {
        await admin.from("sa_ki_ni_offres").delete().eq("id", existing.id)           // fermer : rien de vendu → supprime
      } else {
        await admin.from("sa_ki_ni_offres").update({ qty_ouverte: sold, updated_at: new Date().toISOString() }).eq("id", existing.id) // borne à vendu
      }
      continue
    }
    const qty = Math.max(desired, sold) // jamais sous ce qui est déjà pris
    if (existing) {
      await admin.from("sa_ki_ni_offres").update({ qty_ouverte: qty, updated_at: new Date().toISOString() }).eq("id", existing.id)
    } else {
      await admin.from("sa_ki_ni_offres").insert({ service_slot_id: slotId, catalog_item_id: o.catalog_item_id, qty_ouverte: qty })
    }
  }

  // Renvoie l'état à jour (la date déduite du slot via le panneau)
  const { data: slot } = await admin.from("service_slots").select("service_date").eq("id", slotId).maybeSingle()
  return NextResponse.json(slot?.service_date ? await getSaKiNiAdminPanel(admin, slot.service_date) : { ok: true })
}
