import { describe, expect, it } from "vitest"
import {
  csvCell, eurosFR, buildClotureCsv, buildPennylaneRows, buildPennylaneCsv, cloturePath,
  PENNYLANE_COLUMNS, PENNYLANE_MAPPING,
} from "./export-compta"
import type { Cloture, CaisseZ } from "./caisse"

const z: CaisseZ = {
  periode: { type: "jour", start: "2026-09-26", end: "2026-09-26" },
  precommandes: { par_mode: { stripe: 1200, wallet: 500, especes: 300, cb_sumup: 0, non_encaisse: 0 }, nb: 4 },
  comptoir: { par_mode: { wallet: 250, especes: 400, cb_sumup: 0, jeton: 0 }, jetons_qty: 5, nb: 3, nb_annulations: 1 },
  articles: [
    { sku: "P:BENTO-JOUR", name: "Bento du jour", qty: 4, total_cents: 1700, source: "precommande" },
    { sku: "C:BISCUIT", name: "Biscuit", qty: 10, total_cents: 650, source: "comptoir" },
  ],
  wallet: { consomme: 750, recharge: { stripe: 2000, especes: 0, cb_sumup: 0 }, dette_totale: 12500 },
  totaux: {
    ttc_par_mode: { stripe: 1200, wallet: 750, especes: 700, cb_sumup: 0, non_encaisse: 0, jeton: 0 },
    ttc: 2650, especes_attendues: 700,
  },
}

const cloture: Cloture = {
  id: "abc", period_type: "jour", period_start: "2026-09-26", period_end: "2026-09-26",
  generated_at: "2026-09-26T03:30:00Z", data: z, cash_expected_cents: 700,
  cash_counted_cents: 690, cash_diff_cents: -10, cash_note: "Rendu monnaie", cash_counted_at: "2026-09-26T17:00:00Z",
  csv_path: null,
}

describe("export-compta — helpers purs", () => {
  it("eurosFR : centimes → décimale française", () => {
    expect(eurosFR(1250)).toBe("12,50")
    expect(eurosFR(0)).toBe("0,00")
    expect(eurosFR(null)).toBe("0,00")
  })
  it("csvCell : échappe séparateur et guillemets", () => {
    expect(csvCell("simple")).toBe("simple")
    expect(csvCell("a;b")).toBe('"a;b"')
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""')
    expect(csvCell(null)).toBe("")
  })
  it("cloturePath : clotures/AAAA/MM/<type>_<start>.csv", () => {
    expect(cloturePath("jour", "2026-09-26")).toBe("2026/09/jour_2026-09-26.csv")
    expect(cloturePath("mois", "2026-09-01")).toBe("2026/09/mois_2026-09-01.csv")
  })
})

describe("export-compta — CSV archive", () => {
  it("commence par le BOM UTF-8 et contient les totaux", () => {
    const csv = buildClotureCsv(cloture)
    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv).toContain("Total TTC")
    expect(csv).toContain("26,50")            // ttc
    expect(csv).toContain("Écart de caisse")
    expect(csv).toContain("Bento du jour")
  })
})

describe("export-compta — Pennylane", () => {
  it("colonnes figées", () => {
    expect(PENNYLANE_COLUMNS).toEqual(["Date", "Journal", "Compte", "Libellé", "Débit", "Crédit"])
  })
  it("équilibre débit = crédit = TTC", () => {
    const rows = buildPennylaneRows(cloture)
    const toNum = (s: string) => (s ? Number(s.replace(",", ".")) : 0)
    const debit = rows.reduce((n, r) => n + toNum(r.Débit), 0)
    const credit = rows.reduce((n, r) => n + toNum(r.Crédit), 0)
    expect(credit).toBeCloseTo(26.5, 2)
    expect(debit).toBeCloseTo(credit, 2)
  })
  it("crédit unique sur le compte de vente", () => {
    const rows = buildPennylaneRows(cloture)
    const vente = rows.find((r) => r.Compte === PENNYLANE_MAPPING.compteVente.account)!
    expect(vente.Crédit).toBe("26,50")
    // Wallet consolidé (précommande + comptoir) au débit du compte avances.
    const wallet = rows.find((r) => r.Compte === PENNYLANE_MAPPING.encaissements.wallet.account)!
    expect(wallet.Débit).toBe("7,50")
  })
  it("CSV Pennylane : en-tête + lignes", () => {
    const csv = buildPennylaneCsv(cloture)
    expect(csv).toContain("Date;Journal;Compte;Libellé;Débit;Crédit")
    expect(csv.startsWith("﻿")).toBe(true)
  })
})
