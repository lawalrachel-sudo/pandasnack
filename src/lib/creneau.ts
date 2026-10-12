// PS-20 — Correspondance « classe » (eleves_connus) → jour de créneau Pandattitude.
// Valeurs réelles 2026-27 : « Mer 3D », « Sam 3D », « Sam Dessin », « Sam 3D + Sam Dessin »,
// « Mer 3D + Sam Dessin ». Insensible casse/accents. Double jour différent → on prend le PREMIER
// jour et on signale (ambiguous=true). Même jour répété → pas ambigu.
// Les jours retournés sont ceux acceptés par profils.classe (mercredi | vendredi | samedi).

export type JourCreneau = "mercredi" | "vendredi" | "samedi"

export interface CreneauResult {
  jour: JourCreneau | null   // premier jour reconnu, ou null si aucun
  ambiguous: boolean         // plusieurs jours DIFFÉRENTS dans la classe
  source: string | null
}

function strip(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

/** Retourne le(s) jour(s) reconnus dans l'ordre d'apparition (tokens séparés par non-lettres). */
export function joursDansClasse(classe: string | null | undefined): JourCreneau[] {
  const tokens = strip(classe || "").split(/[^a-z]+/).filter(Boolean)
  const out: JourCreneau[] = []
  for (const t of tokens) {
    if (t.startsWith("mer")) out.push("mercredi")
    else if (t.startsWith("sam")) out.push("samedi")
    else if (t.startsWith("ven")) out.push("vendredi")
  }
  return out
}

export function classeToCreneau(classe: string | null | undefined): CreneauResult {
  const jours = joursDansClasse(classe)
  const distinct = Array.from(new Set(jours))
  return { jour: jours[0] ?? null, ambiguous: distinct.length > 1, source: classe ?? null }
}

// PS-21 — classe à poser par le pont PandApp sur un profil enfant :
//  - si l'enfant est un élève COURS (présent dans eleves_connus de l'année, même prénom normalisé)
//    → son vrai jour (mercredi/samedi/vendredi ; double jour → premier jour, cf. classeToCreneau) ;
//  - sinon (enfant stage, hors eleves_connus) → 'stage'.
// Évite qu'un élève cours passé par le pont reste bloqué en 'stage' (le trigger PS-20 ne recrée
// pas un profil déjà existant).
import { prenomKey } from "./eleves-connus"

export function classePourEnfantPont(
  elevesCoursAnnee: Array<{ prenom: string | null; classe: string | null }>,
  prenomEnfant: string | null | undefined,
): JourCreneau | "stage" {
  const k = prenomKey(prenomEnfant)
  const match = (elevesCoursAnnee || []).find((r) => prenomKey(r.prenom) === k)
  if (!match) return "stage"
  return classeToCreneau(match.classe).jour ?? "stage"
}
