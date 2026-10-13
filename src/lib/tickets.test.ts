import { describe, expect, it } from "vitest"
import {
  statutInitial, envoiPennylaneAutorise, isCategorie, isMoyen, ecartLignesVsTotal,
  CATEGORIE_LABEL, STATUT_LABEL, MOYEN_LABEL, CATEGORIES, MOYENS,
} from "./tickets"

describe("tickets (PS-22)", () => {
  it("perso → exclu et JAMAIS envoyé à Pennylane", () => {
    expect(statutInitial("perso")).toBe("exclu")
    expect(envoiPennylaneAutorise("perso")).toBe(false)
  })
  it("pro_snack / pro_ltc → à envoyer, envoi autorisé", () => {
    expect(statutInitial("pro_snack")).toBe("a_envoyer")
    expect(statutInitial("pro_ltc")).toBe("a_envoyer")
    expect(envoiPennylaneAutorise("pro_snack")).toBe(true)
    expect(envoiPennylaneAutorise("pro_ltc")).toBe(true)
  })
  it("isCategorie / isMoyen valident contre les enums", () => {
    expect(isCategorie("pro_snack")).toBe(true)
    expect(isCategorie("nope")).toBe(false)
    expect(isCategorie(undefined)).toBe(false)
    expect(isMoyen("carte_ltc")).toBe(true)
    expect(isMoyen("cheque")).toBe(false)
  })
  it("ecartLignesVsTotal : somme, écart, null si pas de total", () => {
    const lignes = [{ prix_ttc: 2.5 }, { prix_ttc: 1.2 }, { prix_ttc: null }]
    expect(ecartLignesVsTotal(lignes, 3.7)).toEqual({ sommeLignes: 3.7, ecart: 0 })
    expect(ecartLignesVsTotal(lignes, 4)).toEqual({ sommeLignes: 3.7, ecart: -0.3 })
    expect(ecartLignesVsTotal(lignes, null)).toEqual({ sommeLignes: 3.7, ecart: null })
  })
  it("libellés complets pour chaque valeur d'enum", () => {
    for (const c of CATEGORIES) expect(CATEGORIE_LABEL[c]).toBeTruthy()
    for (const m of MOYENS) expect(MOYEN_LABEL[m]).toBeTruthy()
    for (const s of ["a_envoyer","envoye","rapproche","a_verifier","exclu"] as const) expect(STATUT_LABEL[s]).toBeTruthy()
  })
})
