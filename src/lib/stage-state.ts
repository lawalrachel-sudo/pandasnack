// PS-17 — État d'affichage « Stage de Toussaint », dérivé des créneaux stage ACTIFS (aucune date
// en dur) : le hero annonce le stage tant qu'un créneau stage actif est à venir ; le bandeau
// horaires « semaine de stage » s'affiche uniquement les jours de la semaine de stage.
// Dates au format AAAA-MM-JJ, « aujourd'hui » = jour Martinique (voir martiniqueToday).

export interface StageDisplay {
  heroUpcoming: boolean // au moins un créneau stage actif dont service_date >= aujourd'hui
  weekNow: boolean      // aujourd'hui est dans [min..max] des créneaux stage actifs
}

export function stageDisplayState(activeStageDates: string[], todayMartinique: string): StageDisplay {
  const dates = (activeStageDates || []).filter(Boolean).sort()
  if (dates.length === 0) return { heroUpcoming: false, weekNow: false }
  const min = dates[0]
  const max = dates[dates.length - 1]
  return {
    heroUpcoming: dates.some((d) => d >= todayMartinique),
    weekNow: todayMartinique >= min && todayMartinique <= max,
  }
}
