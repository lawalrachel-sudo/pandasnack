// PS-17 — Priorité des heros temporels de /commander (et /) : un seul affiché.
// Ordre : Sa ki ni (pendant sa fenêtre) > Stage (semaine de stage) > produit maison (is_hero).
// Fonction pure, testée ; les écrans ne font que l'appliquer.

export type HeroKind = "sakini" | "stage" | "maison" | null

export function pickHero(flags: {
  saKiNiActive?: boolean | null
  stageActive?: boolean | null
  maisonActive?: boolean | null
}): HeroKind {
  if (flags.saKiNiActive) return "sakini"
  if (flags.stageActive) return "stage"
  if (flags.maisonActive) return "maison"
  return null
}
