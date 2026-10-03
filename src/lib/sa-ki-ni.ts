// PS-14 — SA KI NI (« ce qu'il y a ») : logique pure partagée serveur/front.
//
// Après la clôture (veille 20h = orders_cutoff_at du créneau), Rachel ouvre quelques portions en
// plus ; les parents peuvent les prendre le jour J jusqu'à 10h30 Martinique, dans la limite des
// quantités, payées au Panda Wallet. Fermé par défaut : sans offre, rien ne s'affiche.
//
// Martinique = UTC-4 sans heure d'été (cohérent avec src/lib/caisse-date.ts).

/**
 * Supplément éventuel ajouté au prix carte (0 par défaut ; ajouté au total seulement si > 0).
 * MIROIR de v_supp dans la fonction SQL sa_ki_ni_commander (migration 20261009_ps14b_sa_ki_ni.sql) :
 * la valeur fait foi côté serveur SQL ; garder les deux synchronisées.
 */
export const SA_KI_NI_SUPPLEMENT_CENTS = 0

/** Borne haute de la fenêtre : 10h30 Martinique le jour de service (Date absolue). */
export function saKiNiUpperBound(serviceDate: string): Date {
  return new Date(`${serviceDate}T10:30:00-04:00`)
}

/**
 * La fenêtre Sa ki ni est [orders_cutoff_at ; 10h30 Martinique le jour de service].
 * Avant la clôture → fermé. Après 10h30 → fermé.
 */
export function isSaKiNiWindowOpen(
  now: Date,
  cutoffAt: Date | string | null | undefined,
  serviceDate: string,
): boolean {
  if (!cutoffAt) return false
  const cutoff = typeof cutoffAt === "string" ? new Date(cutoffAt) : cutoffAt
  if (Number.isNaN(cutoff.getTime())) return false
  const upper = saKiNiUpperBound(serviceDate)
  return now.getTime() >= cutoff.getTime() && now.getTime() <= upper.getTime()
}

/** Prix d'une portion = prix carte + supplément (seulement si > 0). */
export function saKiNiLineTotalCents(basePriceCents: number): number {
  return basePriceCents + (SA_KI_NI_SUPPLEMENT_CENTS > 0 ? SA_KI_NI_SUPPLEMENT_CENTS : 0)
}

export interface SaKiNiOfferLike {
  qty_ouverte: number
  qty_vendue: number
}

/** Portions encore disponibles pour une offre (jamais négatif). */
export function remainingPortions(offer: SaKiNiOfferLike): number {
  return Math.max(0, (offer.qty_ouverte || 0) - (offer.qty_vendue || 0))
}

/**
 * Le hero temporel Sa ki ni s'affiche sur /commander uniquement si la fenêtre est ouverte ET
 * qu'au moins une offre a encore des portions. Sinon on laisse le hero habituel.
 */
export function shouldShowSaKiNiHero(params: {
  now: Date
  cutoffAt: Date | string | null | undefined
  serviceDate: string | null | undefined
  offers: SaKiNiOfferLike[]
}): boolean {
  const { now, cutoffAt, serviceDate, offers } = params
  if (!serviceDate || !offers || offers.length === 0) return false
  if (!isSaKiNiWindowOpen(now, cutoffAt, serviceDate)) return false
  return offers.some((o) => remainingPortions(o) > 0)
}
