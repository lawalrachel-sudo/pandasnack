// PS-22 §5 — Export JSON compatible calculette (clé panda-snack-calculette-v1) depuis les prix réels
// des tickets pro_snack. Règle d'or §6 (traitement-factures) : l'import ÉCRASE TOUT → on FUSIONNE :
// recettes conservées, ingrédients existants mis à jour par NOM en CONSERVANT leurs id (pour ne pas
// casser recettes[].lignes[].ingId), nouveaux articles → nouveaux ingrédients. On n'invente jamais
// de mapping vers un id existant : le rattachement se fait par nom normalisé uniquement.

export interface CalcIngredient {
  id: string
  nom: string
  cat?: string
  qteCond?: number
  unite?: string
  prixCond?: number        // TTC du conditionnement
  fournisseur?: string
  allergens?: string[]
  derniereMaj?: string
}
export interface CalcFiche {
  panda_snack_calculette: {
    version: number
    export_date: string
    ingredients: CalcIngredient[]
    recettes: unknown[]
    config?: Record<string, unknown>
  }
}
export interface ArticlePrix {
  article: string
  prix_ttc: number
  quantite?: number | null
  unite?: string | null
  fournisseur?: string | null
  date?: string | null
}

export function normNom(s: string | null | undefined): string {
  return (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()
}

// Dernier prix par article (date_ticket la plus récente) + prix précédent + écart %.
export function dernierPrixParArticle(
  lignes: ArticlePrix[],
): Map<string, { courant: ArticlePrix; precedent: ArticlePrix | null; ecartPct: number | null }> {
  const byNom = new Map<string, ArticlePrix[]>()
  for (const l of lignes) {
    if (!l.article || l.prix_ttc == null) continue
    const k = normNom(l.article)
    if (!byNom.has(k)) byNom.set(k, [])
    byNom.get(k)!.push(l)
  }
  const out = new Map<string, { courant: ArticlePrix; precedent: ArticlePrix | null; ecartPct: number | null }>()
  for (const [k, arr] of byNom) {
    arr.sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    const courant = arr[arr.length - 1]
    const precedent = arr.length > 1 ? arr[arr.length - 2] : null
    const ecartPct = precedent && precedent.prix_ttc
      ? Math.round(((courant.prix_ttc - precedent.prix_ttc) / precedent.prix_ttc) * 1000) / 10
      : null
    out.set(k, { courant, precedent, ecartPct })
  }
  return out
}

// Alertes : écart > 10 % (hausse ou baisse) vs achat précédent.
export function alertesEcart(lignes: ArticlePrix[]): { article: string; ecartPct: number }[] {
  const out: { article: string; ecartPct: number }[] = []
  for (const { courant, ecartPct } of dernierPrixParArticle(lignes).values()) {
    if (ecartPct != null && Math.abs(ecartPct) > 10) out.push({ article: courant.article, ecartPct })
  }
  return out
}

let seq = 0
function newId(): string { return `id-${Date.now()}-${seq++}` }

// Fusionne les prix réels dans les ingrédients : match par NOM → maj prixCond/fournisseur/derniereMaj
// en CONSERVANT l'id ; sinon nouvel ingrédient. Retourne la liste fusionnée + les noms ajoutés.
export function fusionIngredients(
  existants: CalcIngredient[],
  lignes: ArticlePrix[],
  now: string = new Date().toISOString(),
): { ingredients: CalcIngredient[]; ajoutes: string[] } {
  const derniers = dernierPrixParArticle(lignes)
  const used = new Set<string>()
  const ingredients = existants.map((ing) => {
    const k = normNom(ing.nom)
    const d = derniers.get(k)
    if (!d) return ing
    used.add(k)
    return {
      ...ing,                                   // id, cat, qteCond, unite, allergens CONSERVÉS
      prixCond: d.courant.prix_ttc,
      fournisseur: d.courant.fournisseur || ing.fournisseur,
      derniereMaj: now,
    }
  })
  const ajoutes: string[] = []
  for (const [k, d] of derniers) {
    if (used.has(k)) continue
    ingredients.push({
      id: newId(),
      nom: d.courant.article,
      cat: "",
      qteCond: d.courant.quantite ?? 1,
      unite: d.courant.unite || "piece",
      prixCond: d.courant.prix_ttc,
      fournisseur: d.courant.fournisseur || undefined,
      allergens: [],
      derniereMaj: now,
    })
    ajoutes.push(d.courant.article)
  }
  return { ingredients, ajoutes }
}

// Construit la fiche fusionnée à partir de la fiche actuelle (recettes + config conservées).
export function buildFiche(
  ficheActuelle: CalcFiche | null,
  lignes: ArticlePrix[],
  now: string = new Date().toISOString(),
): { fiche: CalcFiche; ajoutes: string[]; alertes: { article: string; ecartPct: number }[] } {
  const base = ficheActuelle?.panda_snack_calculette
  const { ingredients, ajoutes } = fusionIngredients(base?.ingredients || [], lignes, now)
  return {
    fiche: {
      panda_snack_calculette: {
        version: base?.version ?? 1,
        export_date: now,
        ingredients,
        recettes: base?.recettes || [],
        config: base?.config,
      },
    },
    ajoutes,
    alertes: alertesEcart(lignes),
  }
}
