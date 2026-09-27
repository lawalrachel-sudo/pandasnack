import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

async function guard() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return { error: auth.error }
  const admin = getSupabaseAdmin()
  if (!admin) return { error: NextResponse.json({ error: "Service indisponible" }, { status: 500 }) }
  return { admin }
}

// GET — liste des articles vendables au comptoir.
export async function GET() {
  const g = await guard()
  if ("error" in g) return g.error
  const { data, error } = await g.admin
    .from("catalog_items")
    .select("id, sku, name, price_alone_cents, stock_qty, is_special, active, allergens, category_id")
    .eq("sellable_comptoir", true).order("sort_order")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ articles: data || [] })
}

// POST — créer un article comptoir (catégorie GOUTER, invisible en précommande).
export async function POST(req: NextRequest) {
  const g = await guard()
  if ("error" in g) return g.error
  const body = await req.json().catch(() => ({}))
  const name = (body?.name || "").trim()
  const price = Math.round(Number(body?.price_alone_cents))
  if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 })
  if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Prix invalide" }, { status: 400 })

  const sku = "GOUT-" + name.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) + "-" + Date.now().toString(36).slice(-4)

  const { data, error } = await g.admin.from("catalog_items").insert({
    category_id: "GOUTER", name, sku, price_alone_cents: price,
    sellable_comptoir: true, sellable_alone: false, sellable_in_menu: false,
    is_special: !!body?.is_special, active: true, sort_order: 90,
    stock_qty: body?.stock_qty === null || body?.stock_qty === undefined || body?.stock_qty === "" ? null : Math.round(Number(body.stock_qty)),
    allergens: Array.isArray(body?.allergens) ? body.allergens : [],
  }).select("id, sku, name, price_alone_cents, stock_qty, is_special, active, allergens").single()
  if (error) { console.error("[boutique/catalogue POST]", error); return NextResponse.json({ error: error.message }, { status: 500 }) }
  return NextResponse.json({ article: data })
}

// PATCH — éditer un article (nom, prix, stock, actif, special, allergènes) ; ou réassort (+N stock).
export async function PATCH(req: NextRequest) {
  const g = await guard()
  if ("error" in g) return g.error
  const body = await req.json().catch(() => ({}))
  const id = body?.id
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })

  // Réassort : + reassort sur stock_qty (le stock doit être suivi).
  if (typeof body.reassort === "number" && body.reassort > 0) {
    const { data: cur } = await g.admin.from("catalog_items").select("stock_qty").eq("id", id).maybeSingle()
    const base = cur?.stock_qty ?? 0
    const { error } = await g.admin.from("catalog_items").update({ stock_qty: base + Math.round(body.reassort) }).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, stock_qty: base + Math.round(body.reassort) })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {}
  if ("name" in body && body.name?.trim()) updates.name = body.name.trim()
  if ("price_alone_cents" in body) {
    const p = Math.round(Number(body.price_alone_cents))
    if (!Number.isFinite(p) || p < 0) return NextResponse.json({ error: "Prix invalide" }, { status: 400 })
    updates.price_alone_cents = p
  }
  if ("stock_qty" in body) updates.stock_qty = body.stock_qty === null || body.stock_qty === "" ? null : Math.round(Number(body.stock_qty))
  if ("active" in body) updates.active = !!body.active
  if ("is_special" in body) updates.is_special = !!body.is_special
  if ("allergens" in body && Array.isArray(body.allergens)) updates.allergens = body.allergens
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Rien à modifier" }, { status: 400 })

  const { data, error } = await g.admin.from("catalog_items").update(updates).eq("id", id)
    .eq("sellable_comptoir", true).select("id, name, price_alone_cents, stock_qty, is_special, active, allergens").single()
  if (error) { console.error("[boutique/catalogue PATCH]", error); return NextResponse.json({ error: error.message }, { status: 500 }) }
  return NextResponse.json({ article: data })
}
