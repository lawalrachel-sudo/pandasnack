// PS-08b — Plafond goûter (comptoir) par enfant et par jour, réglé par le parent.
// null = illimité (défaut). Sinon : entier ≥ 0, multiple de 50 centimes, ≤ 2000 (20 €).

export const PLAFOND_MAX_CENTS = 2000
export const PLAFOND_STEP_CENTS = 50

/** Valide une valeur de plafond entrante (déjà en centimes ou null). */
export function isValidPlafond(v: unknown): v is number | null {
  if (v === null) return true
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= PLAFOND_MAX_CENTS && v % PLAFOND_STEP_CENTS === 0
}

/** Libellé lisible : « 3,50 € / jour » ou « Illimité ». */
export function plafondLabel(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "Illimité"
  return `${(cents / 100).toFixed(2).replace(".", ",")} € / jour`
}
