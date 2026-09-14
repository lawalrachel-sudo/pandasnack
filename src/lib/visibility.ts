// PS-01 — Source unique de la visibilité catalogue par public (source_group / source_detail).
// Utilisée par CommanderClient ET PanierClient (plus de duplication).

export type SourceGroup = "ecole_la_patience" | "pandattitude" | "panda_guest"

export const ALL_SOURCE_GROUPS: SourceGroup[] = ["ecole_la_patience", "pandattitude", "panda_guest"]

// Publics ouverts à l'inscription (onboarding). Rentrée 2026 : pandattitude uniquement.
// Le code École La Patience / Panda Guest reste en place — ajouter la clé ici pour réactiver.
export const ENABLED_SOURCE_GROUPS: SourceGroup[] = ["pandattitude"]

export function isSourceGroupEnabled(sg: string | null | undefined): sg is SourceGroup {
  return !!sg && (ENABLED_SOURCE_GROUPS as string[]).includes(sg)
}

export interface VisibleItem {
  sku: string | null
  active?: boolean
}

// Un article est-il visible pour ce public ? (coming_soon n'entre PAS ici : un article
// « Bientôt disponible » reste visible, il est simplement non sélectionnable côté UI.)
export function visForSource(item: VisibleItem, sg: string | null | undefined, sd?: string | null): boolean {
  if (item.active === false) return false
  const sku = item.sku || ""
  if (!sku) return false
  // Toupiti à la carte dédupliqué : la formula BENTO_TOUPITI assure le rendu École
  if (sku === "BENTO-TOUPITI-CARTE") return false
  // T3 — SAND-VOLAILLE supprimé partout (3 métiers)
  if (sku === "SAND-VOLAILLE") return false
  if (sg === "ecole_la_patience") {
    if (sku.startsWith("CROQ-")) return false
    if (sku === "DRINK-BBL") return false
    if (sku.startsWith("SAL-")) return false
    if (sd === "fond_lahaye" && sku === "SAND-C") return false
    if (sd === "fond_lahaye" && sku === "SAND-A") return false
  }
  // BRIEF Menu Panda (17/06) — pandattitude : salades + burgers visibles (aucune exclusion).
  if (sg === "panda_guest") {
    if (sku.startsWith("SAL-")) return false
    if (sku === "DRINK-BBL") return false  // Bubble Tea exclusif Pandattitude
  }
  return true
}

// SKUs éligibles au slot « Plat principal » du Menu Panda (miroir client de menu_formula_slots).
// PS-01 : CLUB-* (cat SAND) et SOUP-* (cat SOUP, sellable_in_menu) rejoignent la liste.
export function isMenuPlatSku(sku: string | null | undefined, sg: string | null | undefined): boolean {
  const s = sku || ""
  const baseMatch = s.startsWith("SAND-") || s.startsWith("CLUB-") || s.startsWith("PASTA-")
    || s.startsWith("CROQ-") || s.startsWith("SAL-") || s.startsWith("BURGER-") || s.startsWith("SOUP-")
  const bentoBonus = (sg === "pandattitude" || sg === "panda_guest") && s === "BENTO-JOUR"
  // Panda Guest : pas de Croque (école hors-classe pas adaptée)
  if (sg === "panda_guest" && s.startsWith("CROQ-")) return false
  return baseMatch || bentoBonus
}
