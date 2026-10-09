// PS-13b — Source unique des filtres « Métier » de l'admin. Options visibles réduites au bruit
// utile : TOUS · Pandattitude · Panda Devoirs. Les autres métiers (historique) sont MASQUÉS des
// menus mais NI supprimés de l'enum source_group NI effacés — les commandes anciennes restent
// lisibles via metierLabel().

export interface MetierFilter { value: string; label: string }

// Options affichées dans les sélecteurs de l'admin (value "" = TOUS).
export const METIER_FILTERS: MetierFilter[] = [
  { value: "", label: "TOUS" },
  { value: "pandattitude", label: "Pandattitude" },
  { value: "panda_devoirs", label: "Panda Devoirs" },
  { value: "stage", label: "Stage" },  // PS-17 — commandes sur créneau day_type='stage'
]

// Métiers historiques masqués des menus (conservés en base).
export const HIDDEN_METIERS = ["ecole_la_patience", "ecole", "panda_guest", "coffret_bureau", "divers"]

// Libellés complets (menus + affichage historique lisible).
export const METIER_LABELS: Record<string, string> = {
  pandattitude: "Pandattitude",
  panda_devoirs: "Panda Devoirs",
  stage: "Stage",
  ecole_la_patience: "École La Patience",
  ecole: "École",
  panda_guest: "Panda Guest",
  coffret_bureau: "Coffret bureau",
  divers: "Divers",
}

export function metierLabel(metier: string | null | undefined): string {
  if (!metier) return "—"
  return METIER_LABELS[metier] || metier
}

export interface OrderMetierInput { day_type?: string | null; source_group?: string | null }

/**
 * Métier d'une commande — règle UNIQUE, cohérente avec filterSlotsForAccount (PS-10b) :
 * une commande sur un créneau day_type='devoirs' OU un compte source_group='panda_devoirs'
 * est « Panda Devoirs » ; sinon, le source_group du compte.
 */
export function metierOfOrder(o: OrderMetierInput): string {
  if (o.day_type === "devoirs" || o.source_group === "panda_devoirs") return "panda_devoirs"
  if (o.day_type === "stage") return "stage"  // PS-17
  return o.source_group || ""
}

/** La commande correspond-elle au filtre métier choisi ? ("" = tous). */
export function orderMatchesMetier(o: OrderMetierInput, filterValue: string | null | undefined): boolean {
  if (!filterValue) return true
  return metierOfOrder(o) === filterValue
}

/** Libellé court pour l'en-tête d'étiquette (« Devoirs · <date> », « Pandattitude · <date> »). */
export function metierEtiquette(metier: string): string {
  if (metier === "panda_devoirs") return "Devoirs"
  if (metier === "stage") return "Stage"  // PS-17 — en-tête « STAGE · <date> »
  return metierLabel(metier)
}
