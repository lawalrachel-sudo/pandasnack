// PS-08a-b / PS-08a-c — Dates de clôture au fuseau America/Martinique (UTC-4, sans heure
// d'été). Le serveur tourne en UTC : la journée de service = jour civil MARTINIQUE, jamais
// Europe/Paris ni UTC. Une seule source de vérité pour « aujourd'hui » côté caisse & comptoir.

export const CAISSE_TZ = "America/Martinique"

/** Date du jour (AAAA-MM-JJ) au fuseau Martinique, pour un instant donné. */
export function martiniqueToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAISSE_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now)
}

/** Décale une date AAAA-MM-JJ de n jours (UTC pur, sans dérive de fuseau). */
export function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Premier jour du mois d'une date. */
export function monthStart(isoDate: string): string {
  return isoDate.slice(0, 7) + "-01"
}

/** Premier jour de l'année d'une date. */
export function yearStart(isoDate: string): string {
  return isoDate.slice(0, 4) + "-01-01"
}

/** Jour précédent. */
export function previousDay(isoDate: string): string {
  return addDays(isoDate, -1)
}
