// PS-08a-b / PS-08a-c — Logique pure de la clôture automatique (testable sans I/O).
// Décide, pour un instant d'exécution, quelle période clôturer, en JOURS MARTINIQUE.
// « sans action de Rachel ».
//
// Calendrier Vercel (UTC) vs Martinique (UTC-4) :
//   - jour  : 03:30 UTC = 23:30 Martinique → on clôture le JOUR Martinique courant
//             (la veille en UTC), dont le service est déjà passé.
//   - mois  : 04:00 UTC le 1er = 00:00 Martinique le 1er → on clôture le mois qui vient
//             de se terminer (mois du jour précédent en Martinique).
//   - annee : 04:30 UTC le 1er janvier = 00:30 Martinique le 1er janvier → on clôture
//             l'année précédente (CLOSING_YEAR_START, défaut 01-01).

import { martiniqueToday, monthStart, addDays } from "./caisse-date"

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
 * Plan de clôture pour un job, à un instant d'exécution (par défaut : maintenant).
 * Toutes les dates sont des jours Martinique.
 * Renvoie null si rien à faire à cet instant.
 */
export function planForJob(job: CronJob, now: Date = new Date(), yearStartMmdd = "01-01"): CloturePlan | null {
  const mToday = martiniqueToday(now)
  if (job === "jour") {
    // Le jour Martinique courant : son service est terminé, on le fige.
    return { type: "jour", start: mToday, onlyIfActivity: true }
  }
  if (job === "mois") {
    // Le mois qui vient de se terminer = mois du jour précédent (robuste que l'on soit
    // le 1er à 00:00 ou le dernier jour à 23:xx en Martinique).
    const ending = addDays(mToday, -1)
    return { type: "mois", start: monthStart(ending), onlyIfActivity: false }
  }
  // annee : uniquement le jour anniversaire de CLOSING_YEAR_START (en Martinique).
  if (mToday.slice(5) !== yearStartMmdd) return null
  const prevYear = String(Number(mToday.slice(0, 4)) - 1)
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
