import { describe, expect, it } from "vitest"
import { JETON_OPTIONS, cartTotalCents, isComptoirOnly, saleErrorMessage } from "./comptoir"

describe("comptoir — helpers purs (PS-08a)", () => {
  it("total panier = somme, 0 en mode jeton", () => {
    const lines = [{ catalog_item_id: "a", qty: 2, unit_price_cents: 150, name: "Biscuit" }]
    expect(cartTotalCents(lines, "wallet")).toBe(300)
    expect(cartTotalCents(lines, "especes")).toBe(300)
    expect(cartTotalCents(lines, "jeton")).toBe(0)
  })

  it("table des jetons 5/10/15", () => {
    expect(JETON_OPTIONS.map((j) => j.value)).toEqual([5, 10, 15])
    expect(JETON_OPTIONS.find((j) => j.value === 15)!.label).toBe("Bubble Tea")
  })

  it("messages d'erreur avec montants", () => {
    expect(saleErrorMessage("SOLDE_INSUFFISANT", { solde: 200, total: 300 })).toMatch(/2,00 €.*3,00 €.*SumUp/)
    expect(saleErrorMessage("PLAFOND", { consomme: 300, plafond: 300 })).toMatch(/Plafond/)
    expect(saleErrorMessage("STOCK", { name: "Gaufre", stock: 0 })).toMatch(/Gaufre/)
    expect(saleErrorMessage("INCONNU")).toMatch(/impossible/)
  })

  it("isComptoirOnly : vrai seulement si comptoir sans précommande", () => {
    expect(isComptoirOnly({ sellable_comptoir: true, sellable_alone: false, sellable_in_menu: false })).toBe(true)
    expect(isComptoirOnly({ sellable_comptoir: true, sellable_alone: true, sellable_in_menu: false })).toBe(false)
    expect(isComptoirOnly({ sellable_comptoir: false })).toBe(false)
  })
})
