// PS-22 — Tickets de courses : helpers purs (types, libellés, statut initial, contrôle somme).
// 1 photo, 2 usages : dépenses Panda Snack + facture fournisseur Pennylane. Perso = hors circuit.

export type TicketCategorie = "pro_snack" | "pro_ltc" | "perso"
export type TicketMoyen = "carte_ltc" | "especes" | "autre"
export type TicketStatut = "a_envoyer" | "envoye" | "rapproche" | "a_verifier" | "exclu"

export const CATEGORIES: TicketCategorie[] = ["pro_snack", "pro_ltc", "perso"]
export const MOYENS: TicketMoyen[] = ["carte_ltc", "especes", "autre"]

export const CATEGORIE_LABEL: Record<TicketCategorie, string> = {
  pro_snack: "Pro Snack",
  pro_ltc: "Pro LTC",
  perso: "Perso",
}
export const MOYEN_LABEL: Record<TicketMoyen, string> = {
  carte_ltc: "Carte LTC",
  especes: "Espèces",
  autre: "Autre",
}
export const STATUT_LABEL: Record<TicketStatut, string> = {
  a_envoyer: "À envoyer",
  envoye: "Envoyé",
  rapproche: "Rapproché",
  a_verifier: "À vérifier",
  exclu: "Exclu (perso)",
}

export function isCategorie(v: unknown): v is TicketCategorie {
  return typeof v === "string" && (CATEGORIES as string[]).includes(v)
}
export function isMoyen(v: unknown): v is TicketMoyen {
  return typeof v === "string" && (MOYENS as string[]).includes(v)
}

// Perso → hors dépenses Snack, AUCUN appel Pennylane : statut 'exclu'. Sinon prêt à envoyer.
export function statutInitial(cat: TicketCategorie): TicketStatut {
  return cat === "perso" ? "exclu" : "a_envoyer"
}

// Un ticket perso n'est JAMAIS envoyé à Pennylane (garde côté serveur + côté écran).
export function envoiPennylaneAutorise(cat: TicketCategorie): boolean {
  return cat !== "perso"
}

export interface LigneInput {
  article?: string | null
  quantite?: number | null
  unite?: string | null
  prix_ttc?: number | null
  taux_tva?: number | null
}

// Contrôle §3 traitement-factures : somme des prix_ttc des lignes vs montant TTC du ticket.
// ecart null si pas de total saisi. Tolérance au centime laissée à l'appelant.
export function ecartLignesVsTotal(
  lignes: LigneInput[],
  montantTtc: number | null | undefined,
): { sommeLignes: number; ecart: number | null } {
  const somme = Math.round(lignes.reduce((s, l) => s + (Number(l.prix_ttc) || 0), 0) * 100) / 100
  if (montantTtc == null || !Number.isFinite(montantTtc)) return { sommeLignes: somme, ecart: null }
  return { sommeLignes: somme, ecart: Math.round((somme - montantTtc) * 100) / 100 }
}
