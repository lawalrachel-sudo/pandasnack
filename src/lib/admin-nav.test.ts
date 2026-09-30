import { describe, expect, it } from "vitest"
import { ADMIN_TILES, tileHref } from "./admin-nav"

describe("ADMIN_TILES (PS-06e)", () => {
  it("liste et ordre exacts des tuiles", () => {
    expect(ADMIN_TILES.map((t) => t.key)).toEqual([
      "service", "veille", "etiquettes", "clients", "historique", "calculette", "boutique", "caisse", "vue-client", "labo",
    ])
  })

  it("Labo reste grisée avec un badge « Bientôt » ; Boutique est active (PS-08a)", () => {
    const disabled = ADMIN_TILES.filter((t) => t.disabled)
    expect(disabled.map((t) => t.key)).toEqual(["labo"])
    for (const t of disabled) expect(t.badge).toBe("Bientôt")
    expect(ADMIN_TILES.find((t) => t.key === "boutique")!.disabled).toBeFalsy()
    expect(ADMIN_TILES.find((t) => t.key === "caisse")!.disabled).toBeFalsy()
    expect(ADMIN_TILES.find((t) => t.key === "vue-client")!.disabled).toBeFalsy()
  })

  it("les tuiles actives ont un href réel", () => {
    for (const t of ADMIN_TILES.filter((t) => !t.disabled)) {
      expect(t.href).not.toBe("#")
      expect(t.href.length).toBeGreaterThan(0)
    }
  })

  it("chaque tuile a un emoji et un label", () => {
    for (const t of ADMIN_TILES) {
      expect(t.emoji).toBeTruthy()
      expect(t.label).toBeTruthy()
    }
  })
})

describe("tileHref", () => {
  const date = "2026-09-26"
  it("la tuile veille est libellée « Feuille de route » (PS-08a-e)", () => {
    const t = ADMIN_TILES.find((x) => x.key === "veille")!
    expect(t.label).toBe("Feuille de route")
    expect(t.emoji).toBe("📋")
  })
  it("injecte la date pour Veille et Étiquettes", () => {
    expect(tileHref(ADMIN_TILES.find((t) => t.key === "veille")!, date)).toBe("/admin/veille/2026-09-26")
    expect(tileHref(ADMIN_TILES.find((t) => t.key === "etiquettes")!, date)).toBe("/admin/etiquettes/2026-09-26")
  })
  it("laisse les href statiques intacts", () => {
    expect(tileHref(ADMIN_TILES.find((t) => t.key === "clients")!, date)).toBe("/admin/clients")
    expect(tileHref(ADMIN_TILES.find((t) => t.key === "service")!, date)).toBe("/admin/dashboard")
  })
  it("une tuile grisée renvoie #", () => {
    expect(tileHref(ADMIN_TILES.find((t) => t.key === "labo")!, date)).toBe("#")
  })
})
