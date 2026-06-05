// BRIEF Menu Panda §5 (02/06) — option "Sauce piment" gratuite.
// Source de vérité partagée client (commander/panier) + routes admin (labels/order-item).
// ZÉRO changement de schéma : la sauce est portée par order_items.notes.

// Marqueur EXACT écrit dans `notes` quand la sauce piment est choisie via la CASE À COCHER
// indépendante (burgers, bento, salades, menu croque). Chaîne nette, majuscules, sur sa
// PROPRE LIGNE (séparateur \n) — jamais collée au texte existant. Texte seul lisible si
// l'emoji ne s'imprime pas sur l'imprimante thermique.
export const SAUCE_PIMENT_NOTE = "SAUCE PIMENT"

// Ajoute (on=true) ou retire (on=false) la ligne `SAUCE PIMENT` dans `notes`, de façon
// idempotente, sans toucher au reste du contenu (compat swap/commentaire parent).
export function setSauceInNotes(notes: string | null | undefined, on: boolean): string {
  const kept = (notes || "")
    .split("\n")
    .filter((l) => l.trim() !== SAUCE_PIMENT_NOTE)
  const base = kept.join("\n").replace(/\n{2,}/g, "\n").replace(/^\n+|\n+$/g, "")
  if (on) return base ? `${base}\n${SAUCE_PIMENT_NOTE}` : SAUCE_PIMENT_NOTE
  return base
}

// Détection (étiquette source 2, panier, confirmation) : la note contient-elle SAUCE PIMENT ?
export function notesHaveSauce(notes: string | null | undefined): boolean {
  return !!notes && notes.includes(SAUCE_PIMENT_NOTE)
}

// SKUs où la sauce piment est une CASE À COCHER indépendante (et où l'étape toppings n'est
// PAS affichée — le plat arrive tel quel) :
//  - burgers (BURGER-*)
//  - bento (tous : BENTO-JOUR, BENTO_PANDA, BENTO_TOUPITI, BENT-*)
//  - salades (SAL-*)
//  - menu croque (CROQ-PANDA) — PAS croque simple (CROQ-SIMPLE)
export function sauceCheckboxApplies(skuOrCode: string | null | undefined): boolean {
  const s = skuOrCode || ""
  if (s.startsWith("BURGER-")) return true
  if (s.startsWith("SAL-")) return true
  if (s.startsWith("BENT")) return true
  return s === "CROQ-PANDA"
}
