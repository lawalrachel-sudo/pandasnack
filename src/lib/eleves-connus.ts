// PS-05c — Rattachement d'un compte parent aux élèves déjà inscrits (table `eleves_connus`).
//
// `eleves_connus` porte la liste officielle de l'année (annee, prenom, nom, classe,
// email_parent, email_parent2). La table est en RLS sans policy publique : elle n'est
// JAMAIS lue depuis le navigateur — uniquement par /api/eleves-connus en service_role.
//
// Ce module ne contient que de la logique pure (aucun accès réseau) pour rester
// testable : appariement e-mail, normalisation du créneau, dédoublonnage vs profils
// existants.

// Créneaux Pandattitude autorisés dans `profils.classe`. CommanderClient exige une
// classe non nulle pour qu'un profil soit sélectionnable : un élève dont le créneau
// n'est pas reconnu doit être complété à la main par le parent.
export const CRENEAUX_PANDATTITUDE = ["mercredi", "vendredi", "samedi"] as const
export type CreneauPandattitude = (typeof CRENEAUX_PANDATTITUDE)[number]

export interface EleveConnu {
  id: string
  annee: string | number | null
  prenom: string | null
  nom: string | null
  classe: string | null
  email_parent: string | null
  email_parent2: string | null
}

export interface EleveProposable {
  id: string
  prenom: string
  nom: string | null
  /** Créneau reconnu, ou null si la valeur de `eleves_connus.classe` n'est pas exploitable. */
  classe: CreneauPandattitude | null
  /** Valeur brute, affichée au parent quand `classe` est null (aide à choisir). */
  classeSource: string | null
}

/** Comparaison d'e-mails : insensible à la casse et aux espaces de bord. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase()
}

/**
 * Normalise un créneau vers l'une des valeurs acceptées par `profils.classe`.
 * Tolère la casse, les accents et les espaces ("Mercredi", " MERCREDI ", "mércredi").
 * Retourne null si la valeur n'est pas reconnue — le parent devra choisir.
 */
export function normalizeCreneau(value: string | null | undefined): CreneauPandattitude | null {
  const cleaned = (value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
  if (!cleaned) return null
  const hit = CRENEAUX_PANDATTITUDE.find((c) => c === cleaned)
  return hit ?? null
}

/** Clé de dédoublonnage d'un prénom (casse, accents et espaces ignorés). */
export function prenomKey(prenom: string | null | undefined): string {
  return (prenom || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
}

/** L'e-mail du compte figure-t-il dans l'une des deux colonnes parent de la ligne ? */
export function eleveMatchesEmail(eleve: EleveConnu, email: string): boolean {
  const target = normalizeEmail(email)
  if (!target) return false
  return normalizeEmail(eleve.email_parent) === target || normalizeEmail(eleve.email_parent2) === target
}

/**
 * Élèves à proposer au parent : ceux rattachés à son e-mail, dont le prénom n'est pas
 * déjà porté par un profil du compte (archivé ou non — on ne repropose pas un enfant
 * que le parent a volontairement retiré).
 *
 * `eleves` est censé être déjà restreint à l'année courante par l'appelant.
 */
export function elevesProposables(
  eleves: EleveConnu[],
  email: string,
  prenomsDejaPresents: Array<string | null | undefined> = []
): EleveProposable[] {
  const deja = new Set(prenomsDejaPresents.map(prenomKey).filter(Boolean))
  const vus = new Set<string>()
  const out: EleveProposable[] = []

  for (const e of eleves) {
    if (!eleveMatchesEmail(e, email)) continue
    const prenom = (e.prenom || "").trim()
    if (!prenom) continue
    const key = prenomKey(prenom)
    if (deja.has(key) || vus.has(key)) continue
    vus.add(key)
    out.push({
      id: e.id,
      prenom,
      nom: e.nom?.trim() || null,
      classe: normalizeCreneau(e.classe),
      classeSource: e.classe?.trim() || null,
    })
  }

  return out.sort((a, b) => a.prenom.localeCompare(b.prenom, "fr"))
}

/**
 * Année à retenir quand la table en contient plusieurs : la plus grande valeur
 * en comparaison texte ("2026-27" > "2025-26", "2026" > "2025"). Robuste au format
 * exact, qui n'est pas contractuel côté application.
 */
export function anneeLaPlusRecente(eleves: Array<{ annee: string | number | null }>): string | null {
  let max: string | null = null
  for (const e of eleves) {
    if (e.annee === null || e.annee === undefined) continue
    const v = String(e.annee)
    if (max === null || v > max) max = v
  }
  return max
}

/** Lignes de l'année retenue (ou toutes si la colonne est vide partout). */
export function filtreAnnee<T extends { annee: string | number | null }>(eleves: T[], annee: string | null): T[] {
  if (!annee) return eleves
  return eleves.filter((e) => String(e.annee ?? "") === annee)
}
