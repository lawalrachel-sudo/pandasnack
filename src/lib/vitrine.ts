// PS-08b — Vitrine boutique (parents, lecture seule). Regroupe les articles comptoir en
// une carte : hero (produit maison) + articles parents avec leurs variantes actives.
// Aucun stock n'est exposé côté parents.

export interface VitrineRow {
  id: string
  sku: string | null
  name: string
  price_alone_cents: number | null
  image_url: string | null
  allergens: string[] | null
  is_special: boolean
  active: boolean
  is_hero?: boolean | null
  hero_text?: string | null
  parent_id: string | null
}

export interface VitrineVariant { id: string; name: string; sku: string | null }
export interface VitrineCard {
  id: string
  sku: string | null
  name: string
  price_alone_cents: number
  image_url: string | null
  allergens: string[]
  is_special: boolean
  is_hero: boolean
  hero_text: string | null
  variants: VitrineVariant[]
}

export interface Vitrine { hero: VitrineCard | null; cards: VitrineCard[] }

function toCard(r: VitrineRow, variants: VitrineVariant[]): VitrineCard {
  return {
    id: r.id, sku: r.sku, name: r.name, price_alone_cents: r.price_alone_cents ?? 0,
    image_url: r.image_url, allergens: r.allergens || [], is_special: !!r.is_special,
    is_hero: !!r.is_hero, hero_text: r.hero_text ?? null, variants,
  }
}

/** Construit la vitrine à partir des lignes catalog_items (sellable_comptoir). */
export function buildVitrine(rows: VitrineRow[]): Vitrine {
  const active = (rows || []).filter((r) => r.active !== false)
  const parentIds = new Set(active.filter((r) => !r.parent_id).map((r) => r.id))

  const variantsByParent = new Map<string, VitrineVariant[]>()
  for (const r of active) {
    if (!r.parent_id) continue
    if (!parentIds.has(r.parent_id)) continue // variante orpheline (parent inactif/absent) → exclue
    const list = variantsByParent.get(r.parent_id) || []
    list.push({ id: r.id, name: r.name, sku: r.sku })
    variantsByParent.set(r.parent_id, list)
  }

  const parents = active.filter((r) => !r.parent_id)
  const allCards = parents.map((p) => toCard(p, variantsByParent.get(p.id) || []))
  const hero = allCards.find((c) => c.is_hero) || null
  const cards = allCards.filter((c) => !c.is_hero)
  return { hero, cards }
}
