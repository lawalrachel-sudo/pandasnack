// PS-26c — Parseur de ligne de ticket (pour la saisie ultérieure des lignes, OCR non inclus ici).
// Formats Carrefour : ligne au poids « TOMATE RONDE 0,46 KG 6,85 → 3,15 » (quantité 0.46, unité kg,
// prix_ttc 3.15) ; ligne à quantité « ARTICLE 2,00 × 2,25 → 4,51 » (quantité 2, prix_ttc 4.51).
export interface LigneParsee { article: string; quantite: number | null; unite: string | null; prix_ttc: number | null }

const NUM = (s: string) => parseFloat(s.replace(",", "."))

export function parseTicketLine(raw: string): LigneParsee {
  const txt = (raw || "").trim()
  // prix_ttc = dernier montant après « → » ou « = », sinon dernier nombre de la ligne.
  const fleche = txt.match(/(?:→|=|->)\s*([0-9]+[.,][0-9]{2})\s*$/)
  const prix = fleche ? NUM(fleche[1]) : null

  // Ligne au poids : « … 0,46 KG 6,85 → 3,15 » ou « … 0,46 KG → … »
  const poids = txt.match(/([0-9]+[.,][0-9]{1,3})\s*(kg|g|l|ml)\b/i)
  if (poids) {
    return { article: txt.split(poids[0])[0].trim() || txt, quantite: NUM(poids[1]), unite: poids[2].toLowerCase(), prix_ttc: prix }
  }
  // Ligne à quantité : « … 2,00 × 2,25 → 4,51 » ou « 2 x 2,25 »
  const qte = txt.match(/([0-9]+(?:[.,][0-9]+)?)\s*[x×]\s*[0-9]+[.,][0-9]{2}/i)
  if (qte) {
    return { article: txt.split(qte[0])[0].trim() || txt, quantite: NUM(qte[1]), unite: "piece", prix_ttc: prix }
  }
  // Ligne simple : article + prix.
  const article = prix && fleche ? txt.slice(0, txt.lastIndexOf(fleche[0])).trim() : txt
  return { article: article || txt, quantite: prix != null ? 1 : null, unite: prix != null ? "piece" : null, prix_ttc: prix }
}
