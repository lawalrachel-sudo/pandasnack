// Source de vérité unique pour la version des CGU/CGV/Mentions légales.
// Changer cette valeur déclenche la réapparition du LegalAcceptanceGate
// pour tous les users existants (preuve d'acceptation refaite).
// Format : YYYY-MM-DD (date de publication de la version courante).
export const CURRENT_CGU_VERSION = "2026-09-28"

// Un compte existant doit ré-accepter si sa version acceptée diffère de la version courante
// (null = jamais acceptée → modale). L'absence de compte est gérée ailleurs (onboarding).
export function needsLegalAcceptance(accountCguVersion: string | null | undefined): boolean {
  return accountCguVersion !== CURRENT_CGU_VERSION
}
