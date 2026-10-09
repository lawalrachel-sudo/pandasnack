import { describe, expect, it } from "vitest"
import { bonusFreeCount, bonusPreview, groupBonusByChild, bonusIsValid, fmtBonusDate, prenomMatch } from "./panda-bonus"

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
  it("groupBonusByChild : regroupe par prénom (jumelles = 2 badges) avec date de validité", () => {
    const g = groupBonusByChild([
      { id: "1", prenom: "Léa", libelle: "1 bubble tea 🎂", valide_jusqu_au: "2027-06-30" },
      { id: "2", prenom: "Lou", libelle: "1 bubble tea 🎂", valide_jusqu_au: "2027-06-30" },
      { id: "3", prenom: "Léa", libelle: "1 bubble tea 🎂", valide_jusqu_au: "2027-06-30" },
    ])
    const lea = g.find((x) => x.prenom === "Léa")
    expect(lea?.items.length).toBe(2)
    expect(lea?.items[0].valideJusquAu).toBe("2027-06-30")
    expect(g.length).toBe(2)
  })

  it("bonusIsValid : non échu (>= aujourd'hui) vrai ; échu (hier) faux (PS-18b)", () => {
    expect(bonusIsValid("2027-06-30", "2026-10-09")).toBe(true)
    expect(bonusIsValid("2026-10-09", "2026-10-09")).toBe(true)   // même jour = valide
    expect(bonusIsValid("2026-10-08", "2026-10-09")).toBe(false)  // hier = échu
    expect(bonusIsValid(null, "2026-10-09")).toBe(false)
  })

  it("prenomMatch (PS-19) : égalité normalisée (casse/accents/espaces), jamais approximatif", () => {
    expect(prenomMatch("Léa", "lea")).toBe(true)
    expect(prenomMatch("  Noé ", "NOE")).toBe(true)
    expect(prenomMatch("Lou", "Louis")).toBe(false)   // pas d'à-peu-près
    expect(prenomMatch("", "Lou")).toBe(false)
    expect(prenomMatch(null, null)).toBe(false)
  })

  it("fmtBonusDate : AAAA-MM-JJ → JJ/MM/AAAA", () => {
    expect(fmtBonusDate("2027-06-30")).toBe("30/06/2027")
    expect(fmtBonusDate("")).toBe("")
  })
})
