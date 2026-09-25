import { describe, expect, it } from "vitest"
import {
  CLASSES_PAR_METIER,
  DEST_ONBOARDING,
  DEST_PROFILS,
  classeValidePourMetier,
  destinationApresAuth,
  metierFromSourceGroup,
  profilCommandable,
  type GateProfil,
} from "./profil-gate"

// Profil enfant valide Pandattitude, tel que créé par /api/eleves-connus.
const ENFANT: GateProfil = {
  active: true, classe: "mercredi", metier: "pandattitude", type_profil: "eleve", archived_at: null,
}
// Profil « parent » tel que créé par le trigger handle_new_user.
const PARENT_TRIGGER: GateProfil = {
  active: false, classe: null, metier: "pandattitude", type_profil: "adulte", archived_at: null,
}

describe("metierFromSourceGroup", () => {
  it("mappe les trois publics", () => {
    expect(metierFromSourceGroup("ecole_la_patience")).toBe("ecole")
    expect(metierFromSourceGroup("pandattitude")).toBe("pandattitude")
    expect(metierFromSourceGroup("panda_guest")).toBe("panda_guest")
  })
  it("retombe sur pandattitude par défaut", () => {
    expect(metierFromSourceGroup(null)).toBe("pandattitude")
    expect(metierFromSourceGroup("divers")).toBe("pandattitude")
  })
})

describe("classeValidePourMetier", () => {
  it("accepte les créneaux Pandattitude", () => {
    for (const c of CLASSES_PAR_METIER.pandattitude) expect(classeValidePourMetier(c, "pandattitude")).toBe(true)
  })
  it("accepte les classes École", () => {
    for (const c of CLASSES_PAR_METIER.ecole) expect(classeValidePourMetier(c, "ecole")).toBe(true)
  })
  it("refuse le texte libre — c'est ce qui a produit classe='Pandattitude'", () => {
    expect(classeValidePourMetier("Pandattitude", "pandattitude")).toBe(false)
    expect(classeValidePourMetier("Mer 3D", "pandattitude")).toBe(false)
    expect(classeValidePourMetier("Adulte", "pandattitude")).toBe(false)
  })
  it("refuse une classe École sur Pandattitude et l'inverse", () => {
    expect(classeValidePourMetier("primaire", "pandattitude")).toBe(false)
    expect(classeValidePourMetier("mercredi", "ecole")).toBe(false)
  })
  it("Panda Guest n'attend aucune classe", () => {
    expect(classeValidePourMetier(null, "panda_guest")).toBe(true)
    expect(classeValidePourMetier("mercredi", "panda_guest")).toBe(false)
  })
})

describe("profilCommandable", () => {
  it("accepte un profil enfant actif du bon métier", () => {
    expect(profilCommandable(ENFANT, "pandattitude")).toBe(true)
  })
  it("refuse un profil inactif", () => {
    expect(profilCommandable({ ...ENFANT, active: false }, "pandattitude")).toBe(false)
  })
  it("refuse un profil archivé", () => {
    expect(profilCommandable({ ...ENFANT, archived_at: "2026-05-01T00:00:00Z" }, "pandattitude")).toBe(false)
  })
  it("refuse un profil d'un autre métier", () => {
    expect(profilCommandable({ ...ENFANT, metier: "ecole" }, "pandattitude")).toBe(false)
  })

  // ---- Régression : le profil parent du trigger ne doit jamais être commandable ----

  it("refuse le profil parent du trigger", () => {
    expect(profilCommandable(PARENT_TRIGGER, "pandattitude")).toBe(false)
  })
  it("refuse le profil parent même réactivé et doté d'une classe valide", () => {
    expect(profilCommandable({ ...PARENT_TRIGGER, active: true, classe: "mercredi" }, "pandattitude")).toBe(false)
  })
  it("refuse le profil parent tel qu'observé en prod : active=true, classe='Pandattitude'", () => {
    expect(profilCommandable(
      { active: true, classe: "Pandattitude", metier: "pandattitude", type_profil: "adulte", archived_at: null },
      "pandattitude"
    )).toBe(false)
  })
  it("refuse un profil enfant dont la classe est du texte libre", () => {
    expect(profilCommandable({ ...ENFANT, classe: "Pandattitude" }, "pandattitude")).toBe(false)
  })
  it("Panda Guest : un profil adulte actif commande bien pour lui-même", () => {
    expect(profilCommandable(
      { active: true, classe: null, metier: "panda_guest", type_profil: "adulte", archived_at: null },
      "panda_guest"
    )).toBe(true)
  })
})

describe("destinationApresAuth", () => {
  const NEUF = { source_group: "pandattitude", telephone: null, cgu_accepted_at: null }
  const ONBOARDE = { source_group: "pandattitude", telephone: "0696000000", cgu_accepted_at: "2026-06-01T00:00:00Z" }

  it("sans compte → onboarding", () => {
    expect(destinationApresAuth(null, [])).toBe(DEST_ONBOARDING)
  })

  it("public pas encore choisi → onboarding", () => {
    expect(destinationApresAuth({ source_group: null }, [])).toBe(DEST_ONBOARDING)
    expect(destinationApresAuth({ source_group: "divers" }, [])).toBe(DEST_ONBOARDING)
  })

  // ---- Régression PS-05c : le trigger pose source_group, l'onboarding était sauté ----

  it("compte tout neuf avec source_group posé par le trigger → onboarding, PAS /commander", () => {
    expect(destinationApresAuth(NEUF, [PARENT_TRIGGER])).toBe(DEST_ONBOARDING)
  })

  it("le profil parent seul ne vaut pas un profil enfant", () => {
    expect(destinationApresAuth(NEUF, [{ ...PARENT_TRIGGER, active: true, classe: "Pandattitude" }]))
      .toBe(DEST_ONBOARDING)
  })

  it("au moins un enfant commandable → destination demandée", () => {
    expect(destinationApresAuth(ONBOARDE, [PARENT_TRIGGER, ENFANT])).toBe("/commander")
  })

  it("respecte la destination demandée quand elle n'est pas /commander", () => {
    expect(destinationApresAuth(ONBOARDE, [ENFANT], "/panier")).toBe("/panier")
  })

  // ---- Comptes 2025-26 conservés : accès + wallet gardés, pas de re-onboarding ----

  it("onboarding déjà signé mais plus d'enfant → /mon-espace?tab=profils", () => {
    expect(destinationApresAuth(ONBOARDE, [PARENT_TRIGGER])).toBe(DEST_PROFILS)
  })

  it("enfant archivé → /mon-espace?tab=profils, pas de boucle vers /onboarding", () => {
    expect(destinationApresAuth(ONBOARDE, [{ ...ENFANT, archived_at: "2026-07-01T00:00:00Z" }])).toBe(DEST_PROFILS)
  })

  it("téléphone renseigné mais CGU jamais acceptées → onboarding", () => {
    expect(destinationApresAuth({ source_group: "pandattitude", telephone: "0696", cgu_accepted_at: null }, []))
      .toBe(DEST_ONBOARDING)
  })

  it("CGU acceptées via la modale mais onboarding jamais soumis (téléphone NULL) → onboarding", () => {
    // C'est l'état exact des 17 comptes de l'audit.
    expect(destinationApresAuth({ source_group: "pandattitude", telephone: null, cgu_accepted_at: "2026-09-15T21:59:51Z" }, [PARENT_TRIGGER]))
      .toBe(DEST_ONBOARDING)
  })

  it("profils null/undefined ne fait pas planter", () => {
    expect(destinationApresAuth(NEUF, null)).toBe(DEST_ONBOARDING)
    expect(destinationApresAuth(ONBOARDE, undefined)).toBe(DEST_PROFILS)
  })
})
