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
