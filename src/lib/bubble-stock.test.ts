import { describe, expect, it } from "vitest"
import {
  dosesRestantes, estEpuise, estAlerte, inventaireDelta, bubbleTotals, bubbleChoiceLabel,
  conditionnementsFor, DOSE_SIROP_ML, DOSE_PERLES_G,
} from "./bubble-stock"

describe("bubble-stock (PS-23)", () => {
  it("doses restantes = floor(stock/dose)", () => {
    expect(dosesRestantes(750, DOSE_SIROP_ML)).toBe(25)
    expect(dosesRestantes(3200, DOSE_PERLES_G)).toBe(41)
    expect(dosesRestantes(29, DOSE_SIROP_ML)).toBe(0)
    expect(dosesRestantes(0, DOSE_SIROP_ML)).toBe(0)
  })
  it("épuisé = doses < 1 ; alerte = doses < seuil", () => {
    expect(estEpuise(0)).toBe(true)
    expect(estEpuise(1)).toBe(false)
    expect(estAlerte(4, 5)).toBe(true)
    expect(estAlerte(5, 5)).toBe(false)
  })
  it("inventaire = réel − estimé (en base ml/g)", () => {
    expect(inventaireDelta(600, 750)).toBe(-150) // il reste moins que l'estimé
    expect(inventaireDelta(900, 750)).toBe(150)  // il reste plus
    expect(inventaireDelta(750, 750)).toBe(0)
  })
  it("conditionnements par type", () => {
    expect(conditionnementsFor("sirop").map((c) => c.doses)).toEqual([25, 50])
    expect(conditionnementsFor("perles").map((c) => c.doses)).toEqual([41])
  })
  it("totaux feuille de route par sirop et par perle", () => {
    const totals = bubbleTotals([
      { siropName: "Mangue", perlesName: "Passion" },
      { siropName: "Mangue", perlesName: "Lytchee", quantity: 2 },
      { siropName: "Fraise", perlesName: "Passion" },
    ])
    expect(totals.parSirop).toEqual([{ name: "Fraise", count: 1 }, { name: "Mangue", count: 3 }])
    expect(totals.parPerles).toEqual([{ name: "Lytchee", count: 2 }, { name: "Passion", count: 2 }])
  })
  it("libellé choix", () => {
    expect(bubbleChoiceLabel("Mangue", "Passion")).toBe("Mangue / Passion")
    expect(bubbleChoiceLabel(null, null)).toBe(null)
  })
})
