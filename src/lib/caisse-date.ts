// PS-08a-b — Dates de clôture en fuseau Europe/Paris (le serveur tourne en UTC).
// La caisse raisonne en jours de service ; « aujourd'hui » = jour civil parisien.

/** Date du jour (AAAA-MM-JJ) au fuseau Europe/Paris. */
export function parisToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
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

/** Jour de service précédent (la clôture quotidienne porte sur la veille). */
export function previousDay(isoDate: string): string {
  return addDays(isoDate, -1)
}
