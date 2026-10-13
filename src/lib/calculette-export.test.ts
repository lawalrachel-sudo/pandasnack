import { describe, expect, it } from "vitest"
import { fusionIngredients, buildFiche, alertesEcart, dernierPrixParArticle, type CalcFiche } from "./calculette-export"

describe("calculette-export (PS-22 §5)", () => {
  it("fusion : conserve les id existants, maj le prix par nom", () => {
    const existants = [{ id: "ing-1", nom: "Tomate", prixCond: 2.0, qteCond: 1, unite: "kg", cat: "legume" }]
    const lignes = [{ article: "tomate", prix_ttc: 2.5, quantite: 1, unite: "kg", date: "2026-10-10" }]
    const { ingredients, ajoutes } = fusionIngredients(existants, lignes, "2026-10-13T00:00:00Z")
    expect(ingredients[0].id).toBe("ing-1")          // id conservé
    expect(ingredients[0].prixCond).toBe(2.5)         // prix mis à jour
    expect(ingredients[0].cat).toBe("legume")         // reste conservé
    expect(ajoutes).toEqual([])
  })
  it("nouvel article → nouvel ingrédient (id généré), recettes conservées", () => {
    const fiche: CalcFiche = { panda_snack_calculette: { version: 1, export_date: "x", ingredients: [{ id: "ing-1", nom: "Tomate" }], recettes: [{ nom: "Salade" }] } }
    const lignes = [{ article: "Banane", prix_ttc: 1.2, quantite: 1, unite: "kg", date: "2026-10-10" }]
    const { fiche: merged, ajoutes } = buildFiche(fiche, lignes)
    expect(merged.panda_snack_calculette.recettes).toEqual([{ nom: "Salade" }])
    expect(merged.panda_snack_calculette.ingredients.find((i) => i.nom === "Tomate")!.id).toBe("ing-1")
    const banane = merged.panda_snack_calculette.ingredients.find((i) => i.nom === "Banane")!
    expect(banane.id).toMatch(/^id-/)
    expect(banane.prixCond).toBe(1.2)
    expect(ajoutes).toEqual(["Banane"])
  })
  it("dernier prix = date la plus récente ; alerte écart > 10 %", () => {
    const lignes = [
      { article: "Tomate", prix_ttc: 2.0, date: "2026-10-01" },
      { article: "Tomate", prix_ttc: 2.5, date: "2026-10-10" },
    ]
    expect(dernierPrixParArticle(lignes).get("tomate")!.courant.prix_ttc).toBe(2.5)
    expect(alertesEcart(lignes)).toEqual([{ article: "Tomate", ecartPct: 25 }])
    expect(alertesEcart([{ article: "Pain", prix_ttc: 1, date: "2026-10-01" }, { article: "Pain", prix_ttc: 1.05, date: "2026-10-10" }])).toEqual([])
  })
})
