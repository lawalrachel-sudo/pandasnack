import { describe, expect, it } from "vitest"
import { doitEnvoyer, montantMatche, choisirCandidat } from "./pennylane-rules"

describe("pennylane-rules (PS-22)", () => {
  it("perso n'est JAMAIS envoyé", () => {
    expect(doitEnvoyer({ categorie: "perso" })).toEqual({ ok: false, raison: "perso" })
  })
  it("idempotence : déjà envoyé → pas de renvoi", () => {
    expect(doitEnvoyer({ categorie: "pro_snack", pennylane_invoice_id: "123" })).toEqual({ ok: false, raison: "deja_envoye" })
    expect(doitEnvoyer({ categorie: "pro_ltc", pennylane_invoice_id: null })).toEqual({ ok: true })
  })
  it("montant matché au centime (valeur absolue)", () => {
    expect(montantMatche(-12.34, 12.34)).toBe(true)
    expect(montantMatche(12.34, 12.34)).toBe(true)
    expect(montantMatche(-12.35, 12.34)).toBe(false)
  })
  it("aucun rattachement si 0 ou 2+ candidats ; match si exactement 1", () => {
    expect(choisirCandidat([]).action).toBe("verifier")
    expect(choisirCandidat([{ id: 1 }, { id: 2 }]).action).toBe("verifier")
    const un = choisirCandidat([{ id: 7 }])
    expect(un.action).toBe("match")
    expect(un.candidat).toEqual({ id: 7 })
  })
})

import { joursEcoules, decideRapprochement, planifierRapprochements } from "./pennylane-rules"

describe("pennylane-rules — fenêtre de retry J+7 (PS-22 corrections)", () => {
  it("0 candidat AVANT J+7 → reste 'envoye' (retry)", () => {
    expect(decideRapprochement([], "2026-10-10", "2026-10-15")).toEqual({ statut: "envoye" })
    expect(decideRapprochement([], "2026-10-10", "2026-10-17")).toEqual({ statut: "envoye" }) // J+7 pile
  })
  it("0 candidat APRÈS J+7 → a_verifier", () => {
    expect(decideRapprochement([], "2026-10-10", "2026-10-18")).toEqual({ statut: "a_verifier", erreur: "aucune transaction après 7 j" })
  })
  it("2+ candidats → a_verifier tout de suite", () => {
    expect(decideRapprochement([{ id: 1 }, { id: 2 }], "2026-10-10", "2026-10-11")).toEqual({ statut: "a_verifier", erreur: "2 candidats" })
  })
  it("1 candidat → rapproché", () => {
    expect(decideRapprochement([{ id: 9 }], "2026-10-10", "2026-10-11")).toEqual({ statut: "rapproche", transactionId: 9 })
  })
  it("joursEcoules compte correctement", () => {
    expect(joursEcoules("2026-10-10", "2026-10-17")).toBe(7)
    expect(joursEcoules("2026-10-10", "2026-10-10")).toBe(0)
  })
})

describe("pennylane-rules — anti double rattachement (PS-22 corrections)", () => {
  it("une transaction assignée à un ticket ne sert plus à un autre dans le même passage", () => {
    // Deux tickets même montant, même unique transaction candidate (id 100). Le plus ancien gagne.
    const plan = planifierRapprochements([
      { id: "recent", date_ticket: "2026-10-12", candidats: [{ id: 100 }] },
      { id: "ancien", date_ticket: "2026-10-10", candidats: [{ id: 100 }] },
    ], "2026-10-11")
    const ancien = plan.find((p) => p.ticketId === "ancien")!
    const recent = plan.find((p) => p.ticketId === "recent")!
    expect(ancien.decision).toEqual({ statut: "rapproche", transactionId: 100 })
    // Le récent perd son seul candidat → 0 candidat, encore dans la fenêtre → reste 'envoye'.
    expect(recent.decision).toEqual({ statut: "envoye" })
  })
  it("deux transactions distinctes → chaque ticket garde la sienne", () => {
    const plan = planifierRapprochements([
      { id: "a", date_ticket: "2026-10-10", candidats: [{ id: 1 }] },
      { id: "b", date_ticket: "2026-10-10", candidats: [{ id: 2 }] },
    ], "2026-10-11")
    expect(plan.map((p) => p.decision.statut)).toEqual(["rapproche", "rapproche"])
  })
})
