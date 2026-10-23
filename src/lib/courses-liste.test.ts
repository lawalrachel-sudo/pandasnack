import { describe, expect, it } from "vitest"
import { prochainFournisseur, articlesDus, joursEntre, pastille, nomFournisseur, quantiteAffichee, trierListe, grouperParRayon, type ArticleCatalogue } from "./courses-liste"
import { listePdf, paginer, couper, largeur } from "./courses-pdf"

const A = (id: string, cadence: string, dernier_achat: string | null, actif = true): ArticleCatalogue => ({ id, cadence, dernier_achat, actif })
const ids = (l: { id: string }[]) => l.map((a) => a.id)
const AUJ = "2026-10-21"

describe("articlesDus (PS-28)", () => {
  it("joursEntre", () => {
    expect(joursEntre("2026-09-23", AUJ)).toBe(28)
    expect(joursEntre("2026-10-21", AUJ)).toBe(0)
    expect(joursEntre("2026-02-28", "2026-03-01")).toBe(1)
  })
  it("hebdo : toujours dû, même acheté aujourd'hui", () => {
    expect(ids(articlesDus([A("h", "hebdo", AUJ), A("h2", "hebdo", null)], AUJ))).toEqual(["h", "h2"])
  })
  it("mensuel : 27 j non, 28 j oui, null oui", () => {
    expect(ids(articlesDus([A("m27", "mensuel", "2026-09-24")], AUJ))).toEqual([])
    expect(ids(articlesDus([A("m28", "mensuel", "2026-09-23")], AUJ))).toEqual(["m28"])
    expect(ids(articlesDus([A("m40", "mensuel", "2026-09-11")], AUJ))).toEqual(["m40"])
    expect(ids(articlesDus([A("mnull", "mensuel", null)], AUJ))).toEqual(["mnull"])
  })
  it("bimestriel : 55 j non, 56 j oui, null oui", () => {
    expect(ids(articlesDus([A("b55", "bimestriel", "2026-08-27")], AUJ))).toEqual([])
    expect(ids(articlesDus([A("b56", "bimestriel", "2026-08-26")], AUJ))).toEqual(["b56"])
    expect(ids(articlesDus([A("bnull", "bimestriel", null)], AUJ))).toEqual(["bnull"])
  })
  it("ponctuel / cadence inconnue / null : jamais automatiquement", () => {
    expect(ids(articlesDus([A("p", "ponctuel", null), A("p2", "ponctuel", "2020-01-01"), A("x", "annuel", null), { id: "n", actif: true, cadence: null, dernier_achat: null }], AUJ))).toEqual([])
  })
  it("inactif ignoré", () => {
    expect(ids(articlesDus([A("h", "hebdo", null, false)], AUJ))).toEqual([])
  })
  it("pas de doublon : déjà sur la liste, ou deux fois dans le catalogue", () => {
    const cata = [A("h", "hebdo", null), A("m", "mensuel", null), A("h", "hebdo", null)]
    expect(ids(articlesDus(cata, AUJ, new Set(["m"])))).toEqual(["h"])
  })
  it("rejouer après ajout ne rajoute rien", () => {
    const cata = [A("h", "hebdo", null), A("b", "bimestriel", null)]
    const premier = articlesDus(cata, AUJ)
    expect(articlesDus(cata, AUJ, new Set(ids(premier)))).toEqual([])
  })
})

describe("pastilles fournisseur (PS-28)", () => {
  it("couleurs et libellés", () => {
    expect(pastille("Carrefour").couleur).toBe("#DC2626")
    expect(pastille("Carrefour Cluny").cle).toBe("carrefour")
    expect(pastille("Gerembale").couleur).toBe("#16A34A")
    expect(pastille("Socopoint").couleur).toBe("#2563EB")
    expect(pastille("Leclerc La Galleria").cle).toBe("leclerc")
    expect(pastille("MG Store").cle).toBe("mgstore")
    expect(pastille("MG STORE - 2026143972").couleur).toBe("#9333EA")
    expect(pastille("Le Spécialiste de l'Emballage").cle).toBe("autre")
    expect(pastille(null).couleur).toBe("#9CA3AF")
  })
  it("Socopoint s'affiche « Leclerc »", () => {
    expect(nomFournisseur("Socopoint")).toBe("Leclerc")
    expect(nomFournisseur("SOCOPOINT")).toBe("Leclerc")
    expect(nomFournisseur("MG Store")).toBe("MG Store")
    expect(nomFournisseur(null)).toBe("")
  })
})

describe("pastille cliquable (PS-29)", () => {
  it("cycle Carrefour → Gerembale → Leclerc → MG Store → aucun → Carrefour", () => {
    expect(prochainFournisseur("Carrefour")).toBe("Gerembale")
    expect(prochainFournisseur("Gerembale")).toBe("Socopoint")
    expect(prochainFournisseur("Leclerc La Galleria")).toBe("MG Store")
    expect(prochainFournisseur("MG Store")).toBe(null)
    expect(prochainFournisseur(null)).toBe("Carrefour")
    expect(prochainFournisseur("Equip Commerce")).toBe("Carrefour")
  })
})

describe("quantité affichée (PS-28)", () => {
  it("libellé terrain prioritaire, sinon N × / N kg", () => {
    expect(quantiteAffichee(3, "pièce", "5 petites ou 3 grosses")).toBe("5 petites ou 3 grosses")
    expect(quantiteAffichee(2, "pièce", null)).toBe("2 ×")
    expect(quantiteAffichee(1, "paquet", "  ")).toBe("1 ×")
    expect(quantiteAffichee(1.5, "kg")).toBe("1,5 kg")
    expect(quantiteAffichee(null, null)).toBe("1 ×")
  })
})

describe("tri rayon → couleur → alpha (PS-28)", () => {
  const L = (libelle: string, categorie: string, fournisseur: string | null, coche = false) => ({ libelle, categorie, fournisseur, coche })
  it("ordre de visite, puis couleur, puis alphabétique ; cochés en bas de leur rayon", () => {
    const tri = trierListe([
      L("Zeste", "hygiene", "Carrefour"),
      L("Sirop", "bubble_tea", "Socopoint"),
      L("banane", "fruits_legumes", "Gerembale"),
      L("Ananas", "fruits_legumes", "MG Store"),
      L("Carotte", "fruits_legumes", "Carrefour", true),
      L("Tomate", "fruits_legumes", "Carrefour"),
      L("Ail", "fruits_legumes", "Carrefour"),
      L("Perles", "bubble_tea", "Carrefour"),
    ])
    expect(tri.map((l) => l.libelle)).toEqual(["Ail", "Tomate", "banane", "Ananas", "Carotte", "Perles", "Sirop", "Zeste"])
    expect(grouperParRayon(tri).map((g) => [g.rayon, g.lignes.length])).toEqual([["fruits_legumes", 5], ["bubble_tea", 2], ["hygiene", 1]])
  })
})

describe("PDF liste (PS-28)", () => {
  const groupes = [
    { titre: "Fruits & légumes", lignes: [{ libelle: "Carottes (bio)", quantite: "5 petites ou 3 grosses", couleur: "#DC2626" }, { libelle: "Œufs", quantite: "≈ 2 ×", couleur: "#2563EB" }] },
    { titre: "Vide", lignes: [] },
  ]
  it("document PDF valide, ASCII pur, accents encodés en WinAnsi", () => {
    const bytes = listePdf("Courses Panda Snack — 21/10", groupes)
    const txt = String.fromCharCode(...bytes)
    expect(txt.startsWith("%PDF-1.4")).toBe(true)
    expect(txt.trimEnd().endsWith("%%EOF")).toBe(true)
    expect([...bytes].every((b) => b < 128)).toBe(true)
    expect(txt).toContain("\\311")  // É (LÉGUMES)
    expect(txt).toContain("\\214")  // Œ
    expect(txt).toContain("\\(bio\\)")
    expect(txt).not.toContain("VIDE")
    // xref : chaque offset pointe bien sur « n 0 obj ».
    const xref = Number(txt.match(/startxref\n(\d+)/)![1])
    const lignes = txt.slice(xref).split("\n").slice(3)
    lignes.slice(0, 4).forEach((l, i) => expect(txt.slice(Number(l.slice(0, 10)))).toMatch(new RegExp(`^${i + 1} 0 obj`)))
  })
  it("~60 lignes en 10 rayons tiennent sur une page", () => {
    const g = Array.from({ length: 10 }, (_, r) => ({ titre: `Rayon ${r}`, lignes: Array.from({ length: 6 }, (_, i) => ({ libelle: `Article un peu long numéro ${r}-${i}`, quantite: "2 ×", couleur: "#DC2626" })) }))
    expect(paginer("T", g)).toHaveLength(1)
  })
  it("coupe les libellés trop longs", () => {
    const l = couper("Jambon en tranches (Jambon-Fromage, Omelette-Jambon, croques) — 1 ×", 10, 149)
    expect(l.length).toBeGreaterThan(1)
    l.forEach((s) => expect(largeur(s, 10)).toBeLessThanOrEqual(149))
  })
})
