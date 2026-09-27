// PS-06f — Archivage des comptes clients : prédicat métier unique + réactivation auto.

export interface ArchiveAccount {
  is_admin?: boolean | null
  is_test?: boolean | null
}

export interface ArchiveProfil {
  type_profil?: string | null
  active?: boolean | null
  archived_at?: string | null
}

// Un profil rend-il un compte « actif de l'année » ? (enfant commandable présent)
export function isChildActiveProfil(p: ArchiveProfil): boolean {
  return p.type_profil === "eleve" && p.active === true && !p.archived_at
}

/**
 * Un compte est archivable s'il n'est ni admin ni test, et n'a AUCUN profil enfant actif
 * (type_profil='eleve', active=true, non archivé). Historique conservé — l'archivage ne
 * touche que accounts.archived_at.
 */
export function isArchivable(account: ArchiveAccount, profils: ArchiveProfil[]): boolean {
  if (account.is_admin) return false
  if (account.is_test) return false
  return !(profils || []).some(isChildActiveProfil)
}

/**
 * Faut-il réactiver le compte suite à l'écriture de ce profil ? true si le profil est un
 * enfant actif non archivé (création ou réactivation d'un profil 'eleve'). Point de décision
 * unique appelé par toutes les routes qui écrivent un profil enfant.
 */
export function shouldReactivateOnProfil(p: ArchiveProfil): boolean {
  return isChildActiveProfil(p)
}
