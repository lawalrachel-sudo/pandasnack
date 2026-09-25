import { describe, expect, it } from "vitest"
import {
  anneeLaPlusRecente,
  eleveMatchesEmail,
  elevesProposables,
  filtreAnnee,
  normalizeCreneau,
  normalizeEmail,
  prenomKey,
  type EleveConnu,
} from "./eleves-connus"

function eleve(p: Partial<EleveConnu>): EleveConnu {
  return {
    id: p.id ?? "id-1",
    annee: p.annee ?? "2026-27",
    prenom: p.prenom ?? "Samuel",
    nom: p.nom ?? "Germon",
    classe: p.classe ?? "mercredi",
    email_parent: p.email_parent ?? "laurie.germon@gmail.com",
    email_parent2: p.email_parent2 ?? null,
  }
}

describe("normalizeEmail", () => {
  it("met en minuscules et retire les espaces de bord", () => {
    expect(normalizeEmail("  Laurie.Germon@GMAIL.com ")).toBe("laurie.germon@gmail.com")
  })
  it("rend une chaîne vide pour null/undefined", () => {
    expect(normalizeEmail(null)).toBe("")
    expect(normalizeEmail(undefined)).toBe("")
  })
})

describe("normalizeCreneau", () => {
  it("accepte les trois créneaux Pandattitude", () => {
    expect(normalizeCreneau("mercredi")).toBe("mercredi")
    expect(normalizeCreneau("vendredi")).toBe("vendredi")
    expect(normalizeCreneau("samedi")).toBe("samedi")
  })
  it("tolère casse, espaces et accents", () => {
    expect(normalizeCreneau("  MERCREDI ")).toBe("mercredi")
    expect(normalizeCreneau("Mércredi")).toBe("mercredi")
  })
  it("retourne null sur une valeur non reconnue (le parent devra choisir)", () => {
    expect(normalizeCreneau("CM2")).toBeNull()
    expect(normalizeCreneau("")).toBeNull()
    expect(normalizeCreneau(null)).toBeNull()
  })
})

describe("prenomKey", () => {
  it("ignore casse, accents et espaces", () => {
    expect(prenomKey(" Cécile ")).toBe(prenomKey("CECILE"))
  })
})

describe("eleveMatchesEmail", () => {
  it("apparie sur email_parent, insensible à la casse", () => {
    expect(eleveMatchesEmail(eleve({}), "LAURIE.GERMON@gmail.com")).toBe(true)
  })
  it("apparie aussi sur email_parent2", () => {
    const e = eleve({ email_parent: "papa@exemple.fr", email_parent2: "Maman@Exemple.fr" })
    expect(eleveMatchesEmail(e, "maman@exemple.fr")).toBe(true)
  })
  it("refuse une adresse absente des deux colonnes", () => {
    expect(eleveMatchesEmail(eleve({}), "quelquun@autre.fr")).toBe(false)
  })
  it("ne matche jamais sur une adresse vide, même si la colonne est nulle", () => {
    const e = eleve({ email_parent: null, email_parent2: null })
    expect(eleveMatchesEmail(e, "")).toBe(false)
  })
})

describe("elevesProposables", () => {
  const samuel = eleve({ id: "e1", prenom: "Samuel", classe: "mercredi" })
  const thomas = eleve({ id: "e2", prenom: "Thomas", classe: "samedi" })
  const autre = eleve({ id: "e3", prenom: "Lina", email_parent: "autre@parent.fr" })

  it("ne retient que les élèves rattachés à l'e-mail du compte", () => {
    const out = elevesProposables([samuel, thomas, autre], "laurie.germon@gmail.com")
    expect(out.map((e) => e.prenom)).toEqual(["Samuel", "Thomas"])
  })

  it("expose le créneau normalisé et la valeur source", () => {
    const out = elevesProposables([eleve({ id: "e9", classe: " Mercredi " })], "laurie.germon@gmail.com")
    expect(out[0].classe).toBe("mercredi")
    expect(out[0].classeSource).toBe("Mercredi")
  })

  it("laisse classe à null et conserve la source quand le créneau est inexploitable", () => {
    const out = elevesProposables([eleve({ id: "e9", classe: "CM2" })], "laurie.germon@gmail.com")
    expect(out[0].classe).toBeNull()
    expect(out[0].classeSource).toBe("CM2")
  })

  it("exclut les prénoms déjà portés par un profil du compte", () => {
    const out = elevesProposables([samuel, thomas], "laurie.germon@gmail.com", ["samuel"])
    expect(out.map((e) => e.prenom)).toEqual(["Thomas"])
  })

  it("dédoublonne les prénoms en double dans la liste", () => {
    const doublon = eleve({ id: "e4", prenom: "SAMUEL" })
    const out = elevesProposables([samuel, doublon], "laurie.germon@gmail.com")
    expect(out).toHaveLength(1)
  })

  it("ignore les lignes sans prénom", () => {
    const out = elevesProposables([eleve({ id: "e5", prenom: "  " })], "laurie.germon@gmail.com")
    expect(out).toHaveLength(0)
  })

  it("trie par prénom", () => {
    const out = elevesProposables([thomas, samuel], "laurie.germon@gmail.com")
    expect(out.map((e) => e.prenom)).toEqual(["Samuel", "Thomas"])
  })

  it("retourne une liste vide pour une adresse inconnue", () => {
    expect(elevesProposables([samuel, thomas], "inconnu@nulle.part")).toEqual([])
  })
})

describe("anneeLaPlusRecente / filtreAnnee", () => {
  it("retient la plus grande année en comparaison texte", () => {
    expect(anneeLaPlusRecente([{ annee: "2025-26" }, { annee: "2026-27" }])).toBe("2026-27")
    expect(anneeLaPlusRecente([{ annee: 2025 }, { annee: 2026 }])).toBe("2026")
  })
  it("retourne null si aucune année n'est renseignée", () => {
    expect(anneeLaPlusRecente([{ annee: null }])).toBeNull()
  })
  it("ne garde que les lignes de l'année retenue", () => {
    const rows = [{ annee: "2025-26", id: "a" }, { annee: "2026-27", id: "b" }]
    expect(filtreAnnee(rows, "2026-27").map((r) => r.id)).toEqual(["b"])
  })
  it("ne filtre rien quand l'année est null", () => {
    const rows = [{ annee: null, id: "a" }]
    expect(filtreAnnee(rows, null)).toHaveLength(1)
  })
})
