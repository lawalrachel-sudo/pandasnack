// PS-20b — Helpers purs de l'écran admin « Comptes des Pandas » (testés, aucune logique réseau).
import { joursDansClasse } from "@/lib/creneau"

/** Jour(s) retenus pour une classe, pour affichage (« mercredi + samedi »). Jamais « ambigu ». */
export function joursLabel(classe: string | null | undefined): string {
  const jours = Array.from(new Set(joursDansClasse(classe)))
  return jours.length ? jours.join(" + ") : "—"
}

/** Texte de la feuille de confirmation avant création. */
export function confirmText(comptes: number, profils: number): string {
  const c = `${comptes} compte${comptes > 1 ? "s" : ""}`
  const p = `${profils} profil${profils > 1 ? "s" : ""}`
  return `${c} et ${p} vont être créés. Aucun e-mail n'est envoyé aux familles.`
}
