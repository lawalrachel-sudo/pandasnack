// PS-10a — Panda Devoirs : règles d'accès pures (réutilisées par les écrans en PS-10b).
// Un slot « devoirs » (day_type='devoirs') est visible pour un compte qui a un lien Devoirs ;
// un compte externe panda_devoirs ne voit jamais les services pandattitude (midi).

export interface DevoirsAccount { source_group: string | null | undefined }
export interface DevoirsProfil { active?: boolean | null; devoirs?: boolean | null }

/** Le compte a-t-il accès aux créneaux Panda Devoirs (soir) ? */
export function canSeeDevoirsSlots(account: DevoirsAccount, profils: DevoirsProfil[]): boolean {
  if (account?.source_group === "panda_devoirs") return true
  return (profils || []).some((p) => p.active !== false && p.devoirs === true)
}

/** Le compte a-t-il accès aux créneaux pandattitude (midi) ? Un compte devoirs pur : non. */
export function canSeePandattitudeSlots(account: DevoirsAccount): boolean {
  return account?.source_group !== "panda_devoirs"
}
