// PS-05c — Où envoyer un parent après authentification, et quels profils sont commandables.
//
// CONTEXTE (audit PS-05 + analyse base du 25/09/2026)
// `handle_new_user` crée le compte AVEC `source_group = 'pandattitude'` et un profil
// « parent » (type_profil = 'adulte', active = false, sans classe). Or /auth/callback,
// /auth/confirm et /onboarding décidaient tous « onboarding déjà fait » sur le seul
// critère `account.source_group` : tout nouveau parent était donc envoyé droit sur
// /commander, sans jamais passer par l'onboarding. D'où 17 comptes sans profil enfant,
// `telephone` à NULL, et 0 commande depuis la rentrée.
//
// Ce module porte la décision unique, partagée par les quatre points d'entrée, et la
// définition de « profil commandable » (miroir de CommanderClient.activeProfils).

export type Metier = "ecole" | "pandattitude" | "panda_guest"

// Valeurs autorisées dans `profils.classe`, par métier. Toute autre valeur rend le
// profil non commandable : c'est ce qui neutralise les `classe = 'Pandattitude'` écrits
// par l'ancien champ libre de /admin/profils.
export const CLASSES_PAR_METIER: Record<Metier, readonly string[]> = {
  ecole: ["maternelle", "primaire", "college", "lycee", "prof"],
  pandattitude: ["mercredi", "vendredi", "samedi"],
  panda_guest: [],
}

export function metierFromSourceGroup(sg: string | null | undefined): Metier {
  if (sg === "ecole_la_patience") return "ecole"
  if (sg === "panda_guest") return "panda_guest"
  return "pandattitude"
}

/** La valeur est-elle une classe/créneau légitime pour ce métier ? */
export function classeValidePourMetier(classe: string | null | undefined, metier: Metier): boolean {
  const permises = CLASSES_PAR_METIER[metier]
  if (permises.length === 0) return classe === null || classe === undefined || classe === ""
  return !!classe && permises.includes(classe)
}

export interface GateProfil {
  active?: boolean | null
  classe?: string | null
  metier?: string | null
  type_profil?: string | null
  archived_at?: string | null
}

/**
 * Un profil permet-il de passer commande ?
 *
 * Miroir exact de CommanderClient.activeProfils, plus deux garde-fous issus de l'audit :
 *   - `type_profil` doit être 'eleve' hors Panda Guest (le profil parent 'adulte' créé
 *     par le trigger ne doit jamais devenir commandable — un compte a commandé dessus),
 *   - `classe` doit être une valeur du référentiel, pas du texte libre.
 */
export function profilCommandable(p: GateProfil, metier: Metier): boolean {
  if (p.active !== true) return false
  if (p.archived_at) return false
  if (p.metier !== metier) return false
  if (metier === "panda_guest") return true
  if (p.type_profil !== "eleve") return false
  return classeValidePourMetier(p.classe, metier)
}

export interface GateAccount {
  source_group?: string | null
  telephone?: string | null
  cgu_accepted_at?: string | null
}

export const DEST_ONBOARDING = "/onboarding"
export const DEST_PROFILS = "/mon-espace?tab=profils"

/**
 * Destination après connexion / confirmation d'e-mail.
 *
 * - pas de compte, ou public pas encore choisi            → onboarding
 * - au moins un profil enfant commandable                 → destination demandée
 * - onboarding jamais terminé (ni téléphone ni CGU)       → onboarding
 * - onboarding fait mais plus aucun enfant                → /mon-espace?tab=profils
 *
 * Le dernier cas couvre les comptes 2025-26 conservés (décision verrouillée) : ils
 * gardent l'accès et leur wallet, et ne repassent pas par un onboarding déjà signé —
 * ils ajoutent simplement un enfant depuis « Enfants inscrits ».
 */
export function destinationApresAuth(
  account: GateAccount | null | undefined,
  profils: GateProfil[] | null | undefined,
  demandee = "/commander"
): string {
  if (!account) return DEST_ONBOARDING
  const sg = account.source_group
  if (!sg || sg === "divers") return DEST_ONBOARDING

  const metier = metierFromSourceGroup(sg)
  if ((profils || []).some((p) => profilCommandable(p, metier))) return demandee

  // Proxy « onboarding terminé » : le submit renseigne téléphone ET cgu_accepted_at.
  // (cgu_accepted_at seul ne suffit pas : la modale LegalAcceptanceGate le pose aussi.)
  const onboardingFait = !!account.telephone && !!account.cgu_accepted_at
  return onboardingFait ? DEST_PROFILS : DEST_ONBOARDING
}
