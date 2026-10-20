import { describe, expect, it } from "vitest"
import { dansPerimetre, categoriePour, peutEnvoyerPennylane } from "./ticket-import"
import { parseTicketLine } from "./ticket-ligne-parser"

describe("ticket-import — périmètre (PS-26c)", () => {
  it("SOMABRI jamais importé (même si un autre mot matche)", () => {
    expect(dansPerimetre({ supplier_name: "SOMABRI", label: "Facture SOMABRI", date: "2026-10-09" })).toBe(false)
  })
  it("fournisseurs du périmètre inclus", () => {
    expect(dansPerimetre({ supplier_name: "CLUNYBAM SAS (Carrefour Cluny)", date: "2026-09-16" })).toBe(true)
    expect(dansPerimetre({ supplier_name: "MG STORE", date: "2026-09-18" })).toBe(true)
    expect(dansPerimetre({ label: "Facture sans fournisseur n° 8658", date: "2026-05-01" })).toBe(true)
  })
  it("« 8658 » dans le n° d'un AUTRE fournisseur → hors périmètre (faux positif Envato)", () => {
    expect(dansPerimetre({ supplier_name: "Envato Elements", invoice_number: "INV-8658-2025", date: "2025-11-05" })).toBe(false)
  })
  it("hors périmètre exclu", () => {
    expect(dansPerimetre({ supplier_name: "ANTHROPIC", label: "Claude Max", date: "2026-07-17" })).toBe(false)
  })
  it("categorie : Carrefour/Socopoint 01/07–31/08/2026 → pro_ltc, sinon pro_snack", () => {
    expect(categoriePour({ supplier_name: "CLUNYBAM (Carrefour Cluny)", date: "2026-07-24" })).toBe("pro_ltc")
    expect(categoriePour({ supplier_name: "SOCOPOINT", date: "2026-08-10" })).toBe("pro_ltc")
    expect(categoriePour({ supplier_name: "CLUNYBAM (Carrefour Cluny)", date: "2026-09-16" })).toBe("pro_snack")
    expect(categoriePour({ supplier_name: "MG STORE", date: "2026-07-24" })).toBe("pro_snack")
  })
  it("garde PS-22 : ticket importé jamais renvoyé", () => {
    expect(peutEnvoyerPennylane({ source: "import_pennylane", pennylane_invoice_id: "x" })).toBe(false)
    expect(peutEnvoyerPennylane({ source: "appli", pennylane_invoice_id: "x" })).toBe(false)
    expect(peutEnvoyerPennylane({ source: "appli", pennylane_invoice_id: null })).toBe(true)
  })
})

describe("ticket-ligne-parser (PS-26c)", () => {
  it("ligne au poids (kg)", () => {
    expect(parseTicketLine("TOMATE RONDE 0,46 KG 6,85 → 3,15")).toEqual({ article: "TOMATE RONDE", quantite: 0.46, unite: "kg", prix_ttc: 3.15 })
  })
  it("ligne à quantité", () => {
    expect(parseTicketLine("EMMENTAL 2,00 × 2,25 → 4,51")).toEqual({ article: "EMMENTAL", quantite: 2, unite: "piece", prix_ttc: 4.51 })
  })
  it("ligne simple", () => {
    expect(parseTicketLine("BAGUETTE → 0,75")).toEqual({ article: "BAGUETTE", quantite: 1, unite: "piece", prix_ttc: 0.75 })
  })
})
