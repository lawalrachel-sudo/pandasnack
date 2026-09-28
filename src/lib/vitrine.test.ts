import { describe, expect, it } from "vitest"
import { buildVitrine, type VitrineRow } from "./vitrine"

const base = (o: Partial<VitrineRow>): VitrineRow => ({
  id: o.id!, sku: o.sku ?? o.id!, name: o.name ?? o.id!, price_alone_cents: o.price_alone_cents ?? 100,
  image_url: o.image_url ?? null, allergens: o.allergens ?? [], is_special: o.is_special ?? false,
  active: o.active ?? true, is_hero: o.is_hero ?? false, hero_text: o.hero_text ?? null, parent_id: o.parent_id ?? null,
})

describe("buildVitrine (PS-08b)", () => {
  it("exclut les articles inactifs", () => {
    const v = buildVitrine([base({ id: "a" }), base({ id: "b", active: false })])
    expect(v.cards.map((c) => c.id)).toEqual(["a"])
  })

  it("liste les variantes actives sous leur parent, exclut les orphelines", () => {
    const v = buildVitrine([
      base({ id: "glace", name: "Glace" }),
      base({ id: "v1", name: "Vanille", parent_id: "glace" }),
      base({ id: "v2", name: "Choco", parent_id: "glace", active: false }),   // variante inactive
      base({ id: "orph", name: "Fraise", parent_id: "inconnu" }),              // parent absent → orpheline
    ])
    const glace = v.cards.find((c) => c.id === "glace")!
    expect(glace.variants.map((x) => x.name)).toEqual(["Vanille"])
    // l'orpheline n'apparaît pas comme carte ni comme variante
    expect(v.cards.map((c) => c.id)).toEqual(["glace"])
  })

  it("n'expose aucun stock", () => {
    const v = buildVitrine([base({ id: "a" })])
    expect(JSON.stringify(v)).not.toMatch(/stock/i)
  })

  it("hero = l'article is_hero, sorti de la grille", () => {
    const v = buildVitrine([
      base({ id: "a" }),
      base({ id: "cookie", name: "Cookie maison", is_hero: true, hero_text: "Fait maison" }),
    ])
    expect(v.hero?.id).toBe("cookie")
    expect(v.hero?.hero_text).toBe("Fait maison")
    expect(v.cards.map((c) => c.id)).toEqual(["a"]) // le hero n'est pas dupliqué dans la carte
  })

  it("hero null si aucun produit à l'honneur", () => {
    expect(buildVitrine([base({ id: "a" })]).hero).toBeNull()
  })
})
