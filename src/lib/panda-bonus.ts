// PS-18 — Panda Bonus : helpers purs côté affichage. La consommation autoritative est en base
// (RPC panda_bonus_appliquer) ; ici uniquement l'APERÇU panier (combien de produits offerts,
// quelle réduction) et le regroupement « Mes bonus » par enfant.

export const BONUS_PRODUIT_SKU: Record<string, string> = { bubble_tea: "DRINK-BBL" }

/** Nombre de produits offerts pour un aperçu : min(bonus émis, unités éligibles au panier). */
export function bonusFreeCount(emisBonusCount: number, eligibleUnits: number): number {
  return Math.max(0, Math.min(emisBonusCount || 0, eligibleUnits || 0))
}

/** Aperçu panier : nombre offert + réduction en cents (jamais affichée en € côté famille — le
 *  montant sert seulement à recalculer le total du panier). */
export function bonusPreview(emisBonusCount: number, eligibleUnits: number, unitPriceCents: number): { freeCount: number; discountCents: number } {
  const freeCount = bonusFreeCount(emisBonusCount, eligibleUnits)
  return { freeCount, discountCents: freeCount * Math.max(0, unitPriceCents || 0) }
}

export interface BonusRow { id: string; libelle: string; prenom: string | null }

/** Regroupe les bonus « Mes bonus » par enfant (prénom) → liste de libellés. */
export function groupBonusByChild(rows: BonusRow[]): Array<{ prenom: string; libelles: string[] }> {
  const map = new Map<string, string[]>()
  for (const r of rows || []) {
    const k = r.prenom || "—"
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(r.libelle)
  }
  return Array.from(map.entries()).map(([prenom, libelles]) => ({ prenom, libelles }))
}
