// PS-08a-b — Export comptable (pur, sans I/O). Deux sorties à partir d'une clôture :
//   1. buildClotureCsv  : archive lisible (FR, séparateur « ; », décimale « , », BOM UTF-8).
//   2. buildPennylaneCsv : écritures consolidées, mapping colonnes/comptes ISOLÉ ici.
// L'appli n'encaisse rien : ces exports consolident, ils ne créent aucun mouvement d'argent.

import type { Cloture, CaisseZ } from "./caisse"

// ---- Helpers CSV purs -------------------------------------------------------

const SEP = ";"
const BOM = "﻿"

/** Échappe un champ CSV (guillemets doublés si séparateur/quote/retour ligne). */
export function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Montant centimes → euros décimale française (« 12,50 »), sans symbole. */
export function eurosFR(cents: number | null | undefined): string {
  return ((Number(cents) || 0) / 100).toFixed(2).replace(".", ",")
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return BOM + rows.map((r) => r.map(csvCell).join(SEP)).join("\r\n") + "\r\n"
}

// ---- 1. CSV d'archive (lisible) --------------------------------------------

export function buildClotureCsv(c: Cloture): string {
  const z: CaisseZ = c.data
  const rows: (string | number | null | undefined)[][] = []
  rows.push(["Clôture", c.period_type, "du", c.period_start, "au", c.period_end])
  rows.push(["Générée le", c.generated_at])
  rows.push([])
  rows.push(["Section", "Mode", "Montant (€)", "Nb"])
  const pm = z.precommandes.par_mode
  rows.push(["Précommandes", "Stripe", eurosFR(pm.stripe), z.precommandes.nb])
  rows.push(["Précommandes", "Wallet", eurosFR(pm.wallet), ""])
  rows.push(["Précommandes", "Espèces", eurosFR(pm.especes), ""])
  rows.push(["Précommandes", "CB SumUp", eurosFR(pm.cb_sumup), ""])
  rows.push(["Précommandes", "Non encaissé", eurosFR(pm.non_encaisse), ""])
  const cm = z.comptoir.par_mode
  rows.push(["Comptoir", "Wallet", eurosFR(cm.wallet), z.comptoir.nb])
  rows.push(["Comptoir", "Espèces", eurosFR(cm.especes), ""])
  rows.push(["Comptoir", "CB SumUp", eurosFR(cm.cb_sumup), ""])
  rows.push(["Comptoir", "Jetons (qté)", "0,00", z.comptoir.jetons_qty])
  rows.push(["Comptoir", "Annulations", "", z.comptoir.nb_annulations])
  rows.push([])
  rows.push(["Wallet", "Consommé", eurosFR(z.wallet.consomme), ""])
  rows.push(["Wallet", "Recharge Stripe", eurosFR(z.wallet.recharge.stripe), ""])
  rows.push(["Wallet", "Recharge espèces", eurosFR(z.wallet.recharge.especes), ""])
  rows.push(["Wallet", "Recharge CB SumUp", eurosFR(z.wallet.recharge.cb_sumup), ""])
  rows.push(["Wallet", "Dette totale (soldes)", eurosFR(z.wallet.dette_totale), ""])
  rows.push([])
  rows.push(["Total TTC", "", eurosFR(z.totaux.ttc), ""])
  rows.push(["Espèces attendues", "", eurosFR(z.totaux.especes_attendues), ""])
  if (c.cash_counted_cents !== null && c.cash_counted_cents !== undefined) {
    rows.push(["Espèces comptées", "", eurosFR(c.cash_counted_cents), ""])
    rows.push(["Écart de caisse", "", eurosFR(c.cash_diff_cents), c.cash_note || ""])
  }
  rows.push([])
  rows.push(["SKU", "Article", "Qté", "Total (€)", "Source"])
  for (const a of z.articles || []) rows.push([a.sku, a.name, a.qty, eurosFR(a.total_cents), a.source])
  return toCsv(rows)
}

// ---- 2. Export Pennylane : MAPPING ISOLÉ -----------------------------------

/** Colonnes de l'export Pennylane, dans l'ordre. Modifiable sans toucher au reste. */
export const PENNYLANE_COLUMNS = ["Date", "Journal", "Compte", "Libellé", "Débit", "Crédit"] as const

/**
 * Correspondance mode d'encaissement → compte comptable (plan français, à ajuster par
 * la compta). Le wallet est un prépaiement (avance client) : la vente au wallet ne
 * ré-encaisse pas, elle solde l'avance.
 */
export const PENNYLANE_MAPPING = {
  journal: "VT",
  compteVente: { account: "707000", label: "Ventes de marchandises" },
  encaissements: {
    stripe: { account: "512100", label: "Encaissements Stripe" },
    especes: { account: "531000", label: "Caisse espèces" },
    cb_sumup: { account: "512200", label: "Encaissements CB SumUp" },
    wallet: { account: "419100", label: "Avances clients (wallet)" },
    non_encaisse: { account: "411000", label: "Clients — à encaisser" },
  },
} as const

type PennylaneRow = Record<(typeof PENNYLANE_COLUMNS)[number], string>

/** Construit les écritures Pennylane consolidées d'une clôture. */
export function buildPennylaneRows(c: Cloture): PennylaneRow[] {
  const z = c.data
  const date = c.period_end
  const tm = z.totaux.ttc_par_mode
  const rows: PennylaneRow[] = []
  const row = (account: string, label: string, debit: number, credit: number): PennylaneRow => ({
    Date: date, Journal: PENNYLANE_MAPPING.journal, Compte: account, Libellé: label,
    Débit: debit ? eurosFR(debit) : "", Crédit: credit ? eurosFR(credit) : "",
  })
  // Contrepartie de vente (crédit 707) = total TTC consolidé.
  rows.push(row(PENNYLANE_MAPPING.compteVente.account, PENNYLANE_MAPPING.compteVente.label, 0, z.totaux.ttc))
  // Débit des comptes d'encaissement par mode (jetons exclus : 0 €).
  const enc = PENNYLANE_MAPPING.encaissements
  const modes: [number, { account: string; label: string }][] = [
    [tm.stripe, enc.stripe], [tm.especes, enc.especes], [tm.cb_sumup, enc.cb_sumup],
    [tm.wallet, enc.wallet], [tm.non_encaisse, enc.non_encaisse],
  ]
  for (const [amount, m] of modes) if (amount) rows.push(row(m.account, m.label, amount, 0))
  return rows
}

export function buildPennylaneCsv(c: Cloture): string {
  const rows: string[][] = [[...PENNYLANE_COLUMNS]]
  for (const r of buildPennylaneRows(c)) rows.push(PENNYLANE_COLUMNS.map((col) => r[col]))
  return toCsv(rows)
}

/** Chemin d'archive dans le bucket privé « clotures » : clotures/AAAA/MM/<type>_<start>.csv */
export function cloturePath(periodType: string, periodStart: string): string {
  const [yyyy, mm] = periodStart.split("-")
  return `${yyyy}/${mm}/${periodType}_${periodStart}.csv`
}
