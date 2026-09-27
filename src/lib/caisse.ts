// PS-08a-b — Caisse du jour : types du Z (miroir de la fonction SQL caisse_z) + helpers purs.
// L'appli n'encaisse rien : elle consolide les ventes précommande (Stripe/wallet/especes/CB)
// et comptoir. « especes_attendues » = fond de caisse théorique à recompter en fin de service.

export type PeriodType = "jour" | "mois" | "annee"
export type CaissePayMode = "stripe" | "wallet" | "especes" | "cb_sumup" | "non_encaisse" | "jeton"

export interface ZArticle {
  sku: string
  name: string
  qty: number
  total_cents: number
  source: "precommande" | "comptoir"
}

export interface CaisseZ {
  periode: { type: string; start: string; end: string }
  precommandes: {
    par_mode: { stripe: number; wallet: number; especes: number; cb_sumup: number; non_encaisse: number }
    nb: number
  }
  comptoir: {
    par_mode: { wallet: number; especes: number; cb_sumup: number; jeton: number }
    jetons_qty: number
    nb: number
    nb_annulations: number
  }
  articles: ZArticle[]
  wallet: {
    consomme: number
    recharge: { stripe: number; especes: number; cb_sumup: number }
    dette_totale: number
  }
  totaux: {
    ttc_par_mode: { stripe: number; wallet: number; especes: number; cb_sumup: number; non_encaisse: number; jeton: number }
    ttc: number
    especes_attendues: number
  }
}

export interface Cloture {
  id: string
  period_type: PeriodType
  period_start: string
  period_end: string
  generated_at: string
  data: CaisseZ
  cash_expected_cents: number
  cash_counted_cents: number | null
  cash_diff_cents: number | null
  cash_note: string | null
  cash_counted_at: string | null
  csv_path: string | null
}

export const PERIOD_LABEL: Record<PeriodType, string> = { jour: "Jour", mois: "Mois", annee: "Année" }

/** Écart de caisse (compté − attendu). Positif = excédent, négatif = manquant. */
export function cashDiffCents(counted: number | null | undefined, expected: number): number | null {
  if (counted === null || counted === undefined || Number.isNaN(counted)) return null
  return counted - expected
}

/** Total du CA TTC consolidé (précommandes + comptoir, hors jetons à 0 €). */
export function totalTtcCents(z: CaisseZ): number {
  return z?.totaux?.ttc ?? 0
}

/** Top N articles par quantité (analytique). */
export function topArticles(articles: ZArticle[], n = 5): ZArticle[] {
  return [...(articles || [])].sort((a, b) => b.qty - a.qty).slice(0, n)
}
