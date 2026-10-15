import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// PS-23b — Liste de courses. GET : synchronise les suggestions (stock bas) puis renvoie les trois
// sections. POST : valider/ignorer une suggestion, cocher « acheté » (→ réassort auto pour une ligne
// auto_bubble), modifier la quantité, ajouter un article manuel.
const SEL = "id, libelle, quantite, unite, source, bubble_option_id, statut, created_at, updated_at"

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
  const { data: ouvertes } = await admin.from("courses_items").select(SEL)
    .in("statut", ["suggere", "a_acheter"]).order("created_at", { ascending: true })
  const { data: achetes } = await admin.from("courses_items").select(SEL)
    .eq("statut", "achete").gte("updated_at", sept).order("updated_at", { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = (ouvertes || []) as any[]
  return NextResponse.json({
    suggestions: o.filter((l) => l.statut === "suggere"),
    aAcheter: o.filter((l) => l.statut === "a_acheter"),
    achetes: achetes || [],
  })
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

  if (action === "valider") {
    const { error } = await admin.from("courses_items").update({ statut: "a_acheter", updated_at: new Date().toISOString() }).eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  if (action === "ignorer") {
    const { error } = await admin.from("courses_items").update({ statut: "ignore", updated_at: new Date().toISOString() }).eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  if (action === "quantite") {
    const q = Number(body.quantite)
    if (!Number.isFinite(q) || q <= 0) return NextResponse.json({ error: "Quantité invalide" }, { status: 400 })
    const { error } = await admin.from("courses_items").update({ quantite: q, updated_at: new Date().toISOString() }).eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  if (action === "achete") {
    const { error } = await admin.rpc("courses_mark_achete", { p_id: body.id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  if (action === "manuel") {
    const libelle = (body.libelle || "").toString().trim()
    if (!libelle) return NextResponse.json({ error: "Libellé requis" }, { status: 400 })
    const q = body.quantite == null || body.quantite === "" ? 1 : Number(body.quantite)
    const { error } = await admin.from("courses_items").insert({
      libelle, quantite: Number.isFinite(q) && q > 0 ? q : 1,
      unite: (body.unite || "").toString().trim() || null, source: "manuel", statut: "a_acheter",
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 })
}
