// PS-08a — Boutique comptoir : constantes et helpers purs (l'autorité transactionnelle
// est la fonction SQL comptoir_sell ; ici, les libellés et le pré-calcul UX).

export type PaymentMode = "wallet" | "especes" | "cb_sumup" | "jeton"
export const PAYMENT_MODES: PaymentMode[] = ["wallet", "especes", "cb_sumup", "jeton"]

// Jetons Bambou : valeur du jeton → article correspondant. Modifiable plus tard.
export const JETON_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: "Biscuit" },
  { value: 10, label: "Gaufre" },
  { value: 15, label: "Bubble Tea" },
]

export interface CartLine { catalog_item_id: string; qty: number; unit_price_cents: number; name: string }

/** Total du panier (0 en mode jeton, la vente est à 0 €). */
export function cartTotalCents(lines: CartLine[], mode: PaymentMode): number {
  if (mode === "jeton") return 0
  return lines.reduce((s, l) => s + l.unit_price_cents * l.qty, 0)
}

// Messages d'erreur (codes levés par comptoir_sell). detail = jsonb sérialisé éventuel.
export function saleErrorMessage(code: string, detail?: Record<string, unknown> | null): string {
  const euro = (c: unknown) => `${((Number(c) || 0) / 100).toFixed(2).replace(".", ",")} €`
  switch (code) {
    case "SOLDE_INSUFFISANT":
      return `Solde insuffisant (${euro(detail?.solde)} pour ${euro(detail?.total)}). Régler en CB SumUp ?`
    case "PLAFOND":
      return `Plafond goûter atteint : ${euro(detail?.consomme)} déjà consommé aujourd'hui sur ${euro(detail?.plafond)}.`
    case "STOCK":
      return `Stock épuisé pour ${detail?.name || detail?.sku || "cet article"} (reste ${detail?.stock ?? 0}).`
    case "COMPTE_REQUIS_WALLET":
      return "Sélectionne un enfant pour payer au wallet."
    case "JETON_QTY_REQUISE":
      return "Choisis la valeur du jeton (5 / 10 / 15)."
    case "PANIER_VIDE":
      return "Le panier est vide."
    case "ARTICLE_INDISPONIBLE":
      return "Un article n'est plus disponible au comptoir."
    case "JETON_NON_DISPO":
      return "Un article du panier n'est pas payable en jetons."
    default:
      return "Vente impossible. Réessaie."
  }
}

// Un article vendu uniquement au comptoir doit rester invisible en précommande.
export function isComptoirOnly(item: { sellable_comptoir?: boolean | null; sellable_alone?: boolean | null; sellable_in_menu?: boolean | null }): boolean {
  return !!item.sellable_comptoir && !item.sellable_alone && !item.sellable_in_menu
}
