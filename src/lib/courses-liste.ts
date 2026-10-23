// PS-28 — Liste de courses cochable : articles dus (cadence), pastilles fournisseur, tri d'affichage,
// libellé de quantité. Lib pure, testée (courses-liste.test.ts).

import { rayonOrdre } from "./courses-rayons"

export type Cadence = "hebdo" | "mensuel" | "bimestriel" | "ponctuel"

export interface ArticleCatalogue {
  id: string
  actif: boolean
  cadence: Cadence | string | null
  dernier_achat: string | null  // AAAA-MM-JJ
}

// Délai minimal (jours) depuis le dernier achat pour qu'un article redevienne dû.
// hebdo : toujours dû ; ponctuel : jamais automatiquement.
const DELAI: Record<string, number> = { mensuel: 28, bimestriel: 56 }

/** Nombre de jours entre deux dates AAAA-MM-JJ (UTC pur, sans dérive de fuseau). */
export function joursEntre(debut: string, fin: string): number {
  return Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86400000)
}

/**
 * Articles du catalogue à ajouter par « Préparer la liste ».
 * `aujourdHui` = date Martinique (AAAA-MM-JJ). `dejaSurListe` = catalogue_id déjà présents → jamais de doublon.
 */
export function articlesDus<T extends ArticleCatalogue>(catalogue: T[], aujourdHui: string, dejaSurListe: Set<string> = new Set()): T[] {
  const vus = new Set(dejaSurListe)
  const dus: T[] = []
  for (const a of catalogue) {
    if (!a.actif || vus.has(a.id)) continue
    let du = false
    if (a.cadence === "hebdo") du = true
    else if (a.cadence && a.cadence in DELAI) du = !a.dernier_achat || joursEntre(a.dernier_achat, aujourdHui) >= DELAI[a.cadence]
    // TODO PS-27 stock : retirer ici les articles dont le stock est suffisant.
    if (du) { dus.push(a); vus.add(a.id) }
  }
  // TODO EXONA : ajouter ici les articles notés dans EXONA.
  return dus
}

// Pastilles fournisseur : un repère de couleur, rien de plus. Socopoint s'affiche « Leclerc ».
export interface Pastille { cle: "carrefour" | "gerembale" | "leclerc" | "mgstore" | "autre"; couleur: string; nom: string; ordre: number }
export const PASTILLES: Pastille[] = [
  { cle: "carrefour", couleur: "#DC2626", nom: "Carrefour", ordre: 0 },
  { cle: "gerembale", couleur: "#16A34A", nom: "Gerembale", ordre: 1 },
  { cle: "leclerc", couleur: "#2563EB", nom: "Leclerc", ordre: 2 },
  { cle: "mgstore", couleur: "#9333EA", nom: "MG Store", ordre: 3 },
]
const AUTRE: Pastille = { cle: "autre", couleur: "#9CA3AF", nom: "", ordre: 4 }

export function pastille(fournisseur: string | null | undefined): Pastille {
  const f = (fournisseur || "").toLowerCase()
  if (f.includes("carrefour")) return PASTILLES[0]
  if (f.includes("gerembal")) return PASTILLES[1]
  if (f.includes("socopoint") || f.includes("leclerc")) return PASTILLES[2]
  if (f.replace(/\s+/g, "").includes("mgstore")) return PASTILLES[3]
  return { ...AUTRE, nom: fournisseur || "" }
}

// PS-29 — Rachel choisit elle-même le fournisseur préféré en tapant la pastille : cycle
// Carrefour → Gerembale → Leclerc (stocké « Socopoint ») → MG Store → aucun → Carrefour.
export const CYCLE_FOURNISSEURS: (string | null)[] = ["Carrefour", "Gerembale", "Socopoint", "MG Store", null]
export function prochainFournisseur(actuel: string | null | undefined): string | null {
  const cle = pastille(actuel).cle
  const i = cle === "autre" ? CYCLE_FOURNISSEURS.length - 1 : PASTILLES.findIndex((p) => p.cle === cle)
  return CYCLE_FOURNISSEURS[(i + 1) % CYCLE_FOURNISSEURS.length]
}

/** Nom affiché d'un fournisseur (Socopoint → « Leclerc »). */
export function nomFournisseur(fournisseur: string | null | undefined): string {
  const p = pastille(fournisseur)
  return p.cle === "autre" ? (fournisseur || "") : p.nom
}

/** Quantité affichée : libellé terrain s'il existe, sinon « N kg » ou « N × ». */
export function quantiteAffichee(quantite: number | null | undefined, unite: string | null | undefined, quantiteTexte?: string | null): string {
  if (quantiteTexte && quantiteTexte.trim()) return quantiteTexte.trim()
  const n = Number(quantite) || 1
  const nTxt = String(n).replace(".", ",")
  return unite === "kg" ? `${nTxt} kg` : `${nTxt} ×`
}

export interface LigneListe { libelle: string; categorie: string; fournisseur: string | null; coche: boolean }

/** Tri d'affichage : rayon (ordre de visite) → non cochés avant cochés → couleur fournisseur → alphabétique. */
export function trierListe<T extends LigneListe>(lignes: T[]): T[] {
  return [...lignes].sort((a, b) =>
    rayonOrdre(a.categorie) - rayonOrdre(b.categorie)
    || a.categorie.localeCompare(b.categorie)
    || Number(a.coche) - Number(b.coche)
    || pastille(a.fournisseur).ordre - pastille(b.fournisseur).ordre
    || a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" }))
}

/** Groupes par rayon, dans l'ordre de `lignes` (à trier d'abord). */
export function grouperParRayon<T extends LigneListe>(lignes: T[]): { rayon: string; lignes: T[] }[] {
  const out: { rayon: string; lignes: T[] }[] = []
  for (const l of lignes) {
    const last = out[out.length - 1]
    if (last && last.rayon === l.categorie) last.lignes.push(l)
    else out.push({ rayon: l.categorie, lignes: [l] })
  }
  return out
}
