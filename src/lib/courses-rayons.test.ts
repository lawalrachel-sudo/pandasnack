import { describe, expect, it } from "vitest"
import { rayonLabel, rayonOrdre, trierParRayon, pilules, RAYONS } from "./courses-rayons"

describe("courses-rayons (PS-25)", () => {
  it("labels + ordre de visite", () => {
    expect(rayonLabel("bubble_tea")).toBe("Bubble Tea")
    expect(rayonLabel("inconnu")).toBe("Autre")
    expect(rayonOrdre("fruits_legumes")).toBe(0)
    expect(rayonOrdre("autre")).toBe(RAYONS.length - 1)
    expect(rayonOrdre("fruits_legumes")).toBeLessThan(rayonOrdre("hygiene"))
  })
  it("rayons PS-29 : Boucherie, Épices & sauces, Surgelés", () => {
    expect(rayonLabel("boucherie")).toBe("Boucherie")
    expect(rayonLabel("epices_sauces")).toBe("Épices & sauces")
    expect(rayonLabel("surgeles")).toBe("Surgelés")
    expect(rayonOrdre("boucherie")).toBeLessThan(rayonOrdre("frais"))
    expect(rayonOrdre("surgeles")).toBeGreaterThan(rayonOrdre("gouter"))
  })
  it("tri par rayon (ordre de visite)", () => {
    const sorted = trierParRayon([
      { id: "1", categorie: "hygiene" }, { id: "2", categorie: "pain" }, { id: "3", categorie: "fruits_legumes" },
    ])
    expect(sorted.map((s) => s.id)).toEqual(["3", "2", "1"])
  })
  it("pilules : compteurs restants, rayon tout coché à 0", () => {
    const { tout, rayons } = pilules([
      { id: "a", categorie: "pain", coche: false },
      { id: "b", categorie: "pain", coche: true },
      { id: "c", categorie: "frais", coche: true },
    ])
    expect(tout).toBe(1)
    const pain = rayons.find((r) => r.key === "pain")!
    expect(pain).toMatchObject({ restants: 1, total: 2 })
    const frais = rayons.find((r) => r.key === "frais")!
    expect(frais.restants).toBe(0) // grisée
    expect(rayons.map((r) => r.key)).toEqual(["pain", "frais"]) // ordre de visite
  })
})
