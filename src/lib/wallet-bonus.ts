// PS-06a — Crédit manuel du wallet au comptoir : logique pure (montants, bonus, description).
// Testée dans wallet-bonus.test.ts. La grille de bonus vient de wallet_recharge_config.

export interface RechargeTier {
  recharge_cents: number
  bonus_cents: number
  active: boolean
}

// Seuil en dessous duquel on ne propose PAS de bonus (le palier 30 € n'a pas de rappel, brief §3).
export const BONUS_MIN_CENTS = 5000

/**
 * Bonus applicable pour un montant saisi (espèces/virement/CB comptoir), d'après la grille.
 * On retient le palier ACTIF le plus élevé dont le montant de recharge est ≥ 50 € et ≤ montant saisi.
 * Retourne 0 si aucun palier n'est atteint (dont 30 €).
 *
 *   50 €  → +5 €    (palier 50)
 *   70 €  → +5 €    (palier 50, le plus haut atteint)
 *   100 € → +15 €   (palier 100)
 *   30 €  → 0       (sous le seuil de rappel)
 */
export function bonusForAmount(amountCents: number, tiers: RechargeTier[]): number {
  if (!Number.isFinite(amountCents) || amountCents < BONUS_MIN_CENTS) return 0
  const eligible = tiers
    .filter((t) => t.active && t.recharge_cents >= BONUS_MIN_CENTS && t.recharge_cents <= amountCents)
    .sort((a, b) => b.recharge_cents - a.recharge_cents)
  return eligible.length > 0 ? eligible[0].bonus_cents : 0
}

function euros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`
}

const MODE_LABELS: Record<string, string> = {
  especes: "espèces",
  virement: "virement",
  cb_sumup: "CB SumUp",
}

export const VALID_CREDIT_MODES = Object.keys(MODE_LABELS)

/**
 * Libellé de la transaction wallet. Le bonus est TOUJOURS explicite, jamais implicite (brief §3).
 * Ex : « Recharge espèces 50,00 € + bonus 5,00 € ». Une note libre est ajoutée entre parenthèses.
 */
export function creditDescription(amountCents: number, bonusCents: number, mode: string, note?: string | null): string {
  const modeLabel = MODE_LABELS[mode] || mode
  let s = `Recharge ${modeLabel} ${euros(amountCents)}`
  if (bonusCents > 0) s += ` + bonus ${euros(bonusCents)}`
  const n = (note || "").trim()
  if (n) s += ` (${n})`
  return s
}

export interface CreditPlan {
  amountCents: number
  bonusCents: number
  totalCreditCents: number
  newBalanceCents: number
  newTotalCreditedCents: number
  description: string
}

/**
 * Prépare l'écriture d'un crédit manuel : total = montant + bonus, nouveau solde et nouveau
 * cumul crédité. `bonusCents` est la valeur RETENUE par l'admin (peut être 0 s'il a décoché).
 */
export function planCredit(params: {
  amountCents: number
  bonusCents: number
  mode: string
  note?: string | null
  currentBalanceCents: number
  currentTotalCreditedCents: number
}): CreditPlan {
  const { amountCents, bonusCents, mode, note, currentBalanceCents, currentTotalCreditedCents } = params
  const total = amountCents + bonusCents
  return {
    amountCents,
    bonusCents,
    totalCreditCents: total,
    newBalanceCents: currentBalanceCents + total,
    newTotalCreditedCents: currentTotalCreditedCents + total,
    description: creditDescription(amountCents, bonusCents, mode, note),
  }
}
