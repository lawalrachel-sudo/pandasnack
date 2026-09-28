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

function slugify(s: string): string {
  return s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20)
}

// GET — liste des articles vendables au comptoir (parents + variantes, à plat via parent_id).
export async function GET() {
  const g = await guard()
  if ("error" in g) return g.error
  const { data, error } = await g.admin
    .from("catalog_items")
    .select("id, sku, name, price_alone_cents, stock_qty, is_special, active, allergens, category_id, parent_id, image_url, is_hero, hero_text")
    .eq("sellable_comptoir", true).order("sort_order")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ articles: data || [] })
}

// POST — créer un article comptoir OU une variante (si parent_id présent).
export async function POST(req: NextRequest) {
  const g = await guard()
  if ("error" in g) return g.error
  const body = await req.json().catch(() => ({}))
  const name = (body?.name || "").trim()
  if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 })
  const stock = body?.stock_qty === null || body?.stock_qty === undefined || body?.stock_qty === ""
    ? null : Math.round(Number(body.stock_qty))

  // --- Variante : hérite sku préfixe, prix, catégorie et flags du parent. ---
  if (body?.parent_id) {
    const { data: parent, error: pErr } = await g.admin
      .from("catalog_items")
      .select("id, sku, price_alone_cents, category_id, is_special, allergens")
      .eq("id", body.parent_id).eq("sellable_comptoir", true).maybeSingle()
    if (pErr || !parent) return NextResponse.json({ error: "Parent introuvable" }, { status: 400 })
    const sku = `${parent.sku || "GOUT"}-${slugify(name)}-${Date.now().toString(36).slice(-4)}`
    const { data, error } = await g.admin.from("catalog_items").insert({
      parent_id: parent.id, category_id: parent.category_id, name, sku,
      price_alone_cents: parent.price_alone_cents,   // prix = celui du parent (v1)
      sellable_comptoir: true, sellable_alone: false, sellable_in_menu: false,
      is_special: parent.is_special, active: body?.active === false ? false : true, sort_order: 90,
      stock_qty: stock, allergens: parent.allergens || [],
    }).select("id, sku, name, price_alone_cents, stock_qty, is_special, active, allergens, category_id, parent_id").single()
    if (error) { console.error("[boutique/catalogue POST variant]", error); return NextResponse.json({ error: error.message }, { status: 500 }) }
    return NextResponse.json({ article: data })
  }

  // --- Article parent (catégorie GOUTER, invisible en précommande). ---
  const price = Math.round(Number(body?.price_alone_cents))
  if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Prix invalide" }, { status: 400 })
  const sku = "GOUT-" + slugify(name) + "-" + Date.now().toString(36).slice(-4)
  const { data, error } = await g.admin.from("catalog_items").insert({
    category_id: "GOUTER", name, sku, price_alone_cents: price,
    sellable_comptoir: true, sellable_alone: false, sellable_in_menu: false,
    is_special: !!body?.is_special, active: true, sort_order: 90,
    stock_qty: stock, allergens: Array.isArray(body?.allergens) ? body.allergens : [],
  }).select("id, sku, name, price_alone_cents, stock_qty, is_special, active, allergens, category_id, parent_id").single()
  if (error) { console.error("[boutique/catalogue POST]", error); return NextResponse.json({ error: error.message }, { status: 500 }) }
  return NextResponse.json({ article: data })
}

// PATCH — éditer un article/variante ; réassort ; le prix d'un parent est recopié sur ses variantes.
export async function PATCH(req: NextRequest) {
  const g = await guard()
  if ("error" in g) return g.error
  const body = await req.json().catch(() => ({}))
  const id = body?.id
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })

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
  // PS-08b — vitrine : image, produit maison à l'honneur (unique), texte hero (≤ 120 car.).
  if ("image_url" in body) updates.image_url = body.image_url?.trim() ? body.image_url.trim() : null
  if ("hero_text" in body) {
    const t = typeof body.hero_text === "string" ? body.hero_text.trim() : ""
    if (t.length > 120) return NextResponse.json({ error: "Texte hero trop long (120 max)" }, { status: 400 })
    updates.hero_text = t || null
  }
  const settingHero = "is_hero" in body ? !!body.is_hero : null
  if (settingHero !== null) updates.is_hero = settingHero
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Rien à modifier" }, { status: 400 })

  // Un seul produit à l'honneur : désactiver les autres avant d'en activer un (index unique partiel).
  if (settingHero === true) {
    await g.admin.from("catalog_items").update({ is_hero: false }).eq("is_hero", true).neq("id", id)
  }

  const { data, error } = await g.admin.from("catalog_items").update(updates).eq("id", id)
    .eq("sellable_comptoir", true).select("id, name, price_alone_cents, stock_qty, is_special, active, allergens, parent_id, image_url, is_hero, hero_text").single()
  if (error) { console.error("[boutique/catalogue PATCH]", error); return NextResponse.json({ error: error.message }, { status: 500 }) }

  // Le prix vit sur le parent : toute modif de prix est recopiée sur les variantes (v1, pas de prix propre).
  if ("price_alone_cents" in updates && !data.parent_id) {
    await g.admin.from("catalog_items").update({ price_alone_cents: updates.price_alone_cents }).eq("parent_id", id)
  }
  return NextResponse.json({ article: data })
}
