import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { inventaireDelta, DOSE_SIROP_ML, DOSE_PERLES_G } from "@/lib/bubble-stock"

export const dynamic = "force-dynamic"

// PS-23 — Admin Bubble Tea : stock estimé (vue), activation, réassort, inventaire, +parfum/+bubble.
// Journal en ajout seul : toute entrée/correction = un mouvement. Montants en ml (sirop) / g (perles).

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data: options } = await admin.from("bubble_stock_estime").select("*").order("kind").order("sort_order")
  const { data: mouvements } = await admin
    .from("bubble_stock_mouvements")
    .select("id, option_id, qty, source, note, is_test, created_at, bubble_options(name, kind, unite)")
    .order("created_at", { ascending: false }).limit(60)
  return NextResponse.json({ options: options || [], mouvements: mouvements || [] })
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

  if (action === "toggle") {
    const { error } = await admin.from("bubble_options").update({ active: !!body.active }).eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === "seuil") {
    const seuil = Math.max(0, Math.round(Number(body.seuil_doses) || 0))
    const { error } = await admin.from("bubble_options").update({ seuil_doses: seuil }).eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === "create") {
    const kind = body.kind === "perles" ? "perles" : "sirop"
    const name = (body.name || "").toString().trim()
    if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 })
    const { data: mx } = await admin.from("bubble_options").select("sort_order").eq("kind", kind).order("sort_order", { ascending: false }).limit(1).maybeSingle()
    const { error } = await admin.from("bubble_options").insert({
      kind, name, unite: kind === "sirop" ? "ml" : "g",
      dose: kind === "sirop" ? DOSE_SIROP_ML : DOSE_PERLES_G,
      sort_order: (mx?.sort_order || 0) + 1,
    })
    if (error) return NextResponse.json({ error: error.code === "23505" ? "Ce nom existe déjà." : error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (action === "reassort") {
    const base = Number(body.base)
    if (!Number.isFinite(base) || base <= 0) return NextResponse.json({ error: "Quantité invalide" }, { status: 400 })
    const { error } = await admin.from("bubble_stock_mouvements").insert({
      option_id: body.id, qty: base, source: "reassort", note: body.note || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === "inventaire") {
    const reel = Number(body.reel_base)
    if (!Number.isFinite(reel) || reel < 0) return NextResponse.json({ error: "Stock réel invalide" }, { status: 400 })
    const { data: row } = await admin.from("bubble_stock_estime").select("stock").eq("option_id", body.id).maybeSingle()
    const estime = Number(row?.stock || 0)
    const delta = inventaireDelta(reel, estime)
    const { error } = await admin.from("bubble_stock_mouvements").insert({
      option_id: body.id, qty: delta, source: "inventaire",
      note: `Inventaire : réel ${reel} − estimé ${estime}`,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, delta })
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 })
}
