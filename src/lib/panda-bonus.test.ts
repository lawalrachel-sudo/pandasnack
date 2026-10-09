import { describe, expect, it } from "vitest"
import { bonusFreeCount, bonusPreview, groupBonusByChild } from "./panda-bonus"

describe("PS-18 — panda-bonus (aperçu pur)", () => {
  it("1 bonus + 2 bubble tea → 1 offert", () => {
    expect(bonusFreeCount(1, 2)).toBe(1)
    expect(bonusPreview(1, 2, 250)).toEqual({ freeCount: 1, discountCents: 250 })
  })
  it("cumul : 2 bonus + 2 bubble tea → 2 offerts", () => {
    expect(bonusPreview(2, 2, 250)).toEqual({ freeCount: 2, discountCents: 500 })
  })
  it("plus de bonus que d'unités → borné aux unités", () => {
    expect(bonusPreview(3, 1, 250)).toEqual({ freeCount: 1, discountCents: 250 })
  })
  it("aucun bonus ou aucune unité → rien", () => {
    expect(bonusPreview(0, 2, 250)).toEqual({ freeCount: 0, discountCents: 0 })
    expect(bonusPreview(2, 0, 250)).toEqual({ freeCount: 0, discountCents: 0 })
  })
  it("groupBonusByChild : regroupe par prénom (jumelles = 2 libellés)", () => {
    const g = groupBonusByChild([
      { id: "1", prenom: "Léa", libelle: "1 bubble tea 🎂" },
      { id: "2", prenom: "Lou", libelle: "1 bubble tea 🎂" },
      { id: "3", prenom: "Léa", libelle: "1 bubble tea 🎂" },
    ])
    const lea = g.find((x) => x.prenom === "Léa")
    expect(lea?.libelles.length).toBe(2)
    expect(g.length).toBe(2)
  })
})
