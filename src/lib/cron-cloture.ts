// PS-08a-b — Logique pure de la clôture automatique (testable sans I/O).
// Décide, pour une date d'exécution, quelles périodes clôturer. « sans action de Rachel ».

import { parisToday, previousDay, monthStart, addDays } from "./caisse-date"

export type CronJob = "jour" | "mois" | "annee"

export interface CloturePlan {
  type: CronJob
  /** date de début de la période à clôturer (AAAA-MM-JJ). */
  start: string
  /** true → clôturer seulement s'il y a eu de l'activité (cas quotidien). */
  onlyIfActivity: boolean
}

/** Début de l'année de clôture (CLOSING_YEAR_START='MM-JJ', défaut 1er janvier). */
export function closingYearStart(isoDate: string, mmdd = "01-01"): string {
  return `${isoDate.slice(0, 4)}-${mmdd}`
}

/**
 * Plan de clôture pour un job donné à une date d'exécution.
 * - jour  : clôture la veille (si activité).
 * - mois  : le 1er du mois, clôture le mois précédent.
 * - annee : le jour anniversaire de CLOSING_YEAR_START, clôture l'année précédente.
 * Renvoie null si rien à faire ce jour-là.
 */
export function planForJob(job: CronJob, runDate: string = parisToday(), yearStartMmdd = "01-01"): CloturePlan | null {
  if (job === "jour") {
    return { type: "jour", start: previousDay(runDate), onlyIfActivity: true }
  }
  if (job === "mois") {
    if (!runDate.endsWith("-01")) return null // pas le 1er
    const prevMonthAnyDay = addDays(monthStart(runDate), -1)
    return { type: "mois", start: monthStart(prevMonthAnyDay), onlyIfActivity: false }
  }
  // annee : uniquement le jour = CLOSING_YEAR_START
  if (runDate.slice(5) !== yearStartMmdd) return null
  const prevYear = String(Number(runDate.slice(0, 4)) - 1)
  return { type: "annee", start: `${prevYear}-${yearStartMmdd}`, onlyIfActivity: false }
}

/** Le Z est-il vide ? (aucune commande ni vente comptoir, aucun mouvement TTC.) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isEmptyZ(z: any): boolean {
  if (!z) return true
  const nb = (z.precommandes?.nb || 0) + (z.comptoir?.nb || 0) + (z.comptoir?.nb_annulations || 0)
  const ttc = z.totaux?.ttc || 0
  const jetons = z.comptoir?.jetons_qty || 0
  return nb === 0 && ttc === 0 && jetons === 0
}
