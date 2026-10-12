import { describe, expect, it } from "vitest"
import { classeToCreneau, classePourEnfantPont } from "./creneau"

describe("PS-20 — classeToCreneau (5 valeurs réelles 2026-27)", () => {
  it("« Mer 3D » → mercredi, non ambigu", () => {
    expect(classeToCreneau("Mer 3D")).toMatchObject({ jour: "mercredi", ambiguous: false })
  })
  it("« Sam 3D » → samedi", () => {
    expect(classeToCreneau("Sam 3D")).toMatchObject({ jour: "samedi", ambiguous: false })
  })
  it("« Sam Dessin » → samedi", () => {
    expect(classeToCreneau("Sam Dessin")).toMatchObject({ jour: "samedi", ambiguous: false })
  })
  it("« Sam 3D + Sam Dessin » → samedi, non ambigu (même jour)", () => {
    expect(classeToCreneau("Sam 3D + Sam Dessin")).toMatchObject({ jour: "samedi", ambiguous: false })
  })
  it("« Mer 3D + Sam Dessin » → mercredi (premier jour) + AMBIGU", () => {
    expect(classeToCreneau("Mer 3D + Sam Dessin")).toMatchObject({ jour: "mercredi", ambiguous: true })
  })
  it("insensible casse/accents", () => {
    expect(classeToCreneau(" MÉR 3d ").jour).toBe("mercredi")
    expect(classeToCreneau("vén").jour).toBe("vendredi")
  })
  it("valeur non reconnue → null, non ambigu", () => {
    expect(classeToCreneau("Atelier libre")).toMatchObject({ jour: null, ambiguous: false })
    expect(classeToCreneau(null).jour).toBe(null)
  })

  describe("PS-21 — classePourEnfantPont (pont : cours → vrai jour, sinon stage)", () => {
    const cours = [
      { prenom: "Lou", classe: "Mer 3D" },
      { prenom: "Sofia", classe: "Mer 3D + Sam Dessin" },
      { prenom: "Zoé", classe: "Sam 3D" },
    ]
    it("élève cours → son vrai jour", () => {
      expect(classePourEnfantPont(cours, "Lou")).toBe("mercredi")
      expect(classePourEnfantPont(cours, "Zoé")).toBe("samedi")
    })
    it("Sofia (double jour) → mercredi (premier), commandable (classe du référentiel)", () => {
      expect(classePourEnfantPont(cours, "Sofia")).toBe("mercredi")
    })
    it("enfant STAGE hors eleves_connus → 'stage'", () => {
      expect(classePourEnfantPont(cours, "Nouveau")).toBe("stage")
      expect(classePourEnfantPont([], "Qui")).toBe("stage")
    })
    it("match prénom insensible casse/accents", () => {
      expect(classePourEnfantPont(cours, " SOFÌA ")).toBe("mercredi")
    })
  })
})
