import { describe, expect, it } from "vitest"
import {
  SA_KI_NI_SUPPLEMENT_CENTS, saKiNiUpperBound, isSaKiNiWindowOpen,
  saKiNiLineTotalCents, remainingPortions, shouldShowSaKiNiHero,
} from "./sa-ki-ni"

const DATE = "2026-10-03"
const CUTOFF = "2026-10-02T20:00:00-04:00"          // veille 20h Martinique
const BEFORE_CUTOFF = new Date("2026-10-02T18:00:00-04:00")
const BETWEEN = new Date("2026-10-03T08:00:00-04:00") // jour J, 8h
const AFTER_1030 = new Date("2026-10-03T11:00:00-04:00")

describe("PS-14 — sa-ki-ni (logique pure)", () => {
  it("borne haute = 10h30 Martinique du jour de service", () => {
    expect(saKiNiUpperBound(DATE).toISOString()).toBe(new Date("2026-10-03T10:30:00-04:00").toISOString())
  })

  describe("fenêtre", () => {
    it("entre clôture et 10h30 → ouverte", () => {
      expect(isSaKiNiWindowOpen(BETWEEN, CUTOFF, DATE)).toBe(true)
    })
    it("avant la clôture → fermée", () => {
      expect(isSaKiNiWindowOpen(BEFORE_CUTOFF, CUTOFF, DATE)).toBe(false)
    })
    it("après 10h30 → fermée", () => {
      expect(isSaKiNiWindowOpen(AFTER_1030, CUTOFF, DATE)).toBe(false)
    })
    it("sans cutoff → fermée", () => {
      expect(isSaKiNiWindowOpen(BETWEEN, null, DATE)).toBe(false)
    })
  })

  describe("prix", () => {
    it("supplément 0 par défaut → prix carte inchangé", () => {
      expect(SA_KI_NI_SUPPLEMENT_CENTS).toBe(0)
      expect(saKiNiLineTotalCents(250)).toBe(250)
      expect(saKiNiLineTotalCents(1000)).toBe(1000)
    })
  })

  describe("portions restantes", () => {
    it("ouverte - vendue, jamais négatif", () => {
      expect(remainingPortions({ qty_ouverte: 5, qty_vendue: 2 })).toBe(3)
      expect(remainingPortions({ qty_ouverte: 2, qty_vendue: 2 })).toBe(0)
      expect(remainingPortions({ qty_ouverte: 2, qty_vendue: 5 })).toBe(0)
    })
  })

  describe("hero temporel", () => {
    const offer = { qty_ouverte: 3, qty_vendue: 1 } // 2 restantes
    it("absent sans offre", () => {
      expect(shouldShowSaKiNiHero({ now: BETWEEN, cutoffAt: CUTOFF, serviceDate: DATE, offers: [] })).toBe(false)
    })
    it("présent avec offre dispo dans la fenêtre", () => {
      expect(shouldShowSaKiNiHero({ now: BETWEEN, cutoffAt: CUTOFF, serviceDate: DATE, offers: [offer] })).toBe(true)
    })
    it("absent après 10h30 même avec offre", () => {
      expect(shouldShowSaKiNiHero({ now: AFTER_1030, cutoffAt: CUTOFF, serviceDate: DATE, offers: [offer] })).toBe(false)
    })
    it("absent si toutes les offres épuisées", () => {
      expect(shouldShowSaKiNiHero({ now: BETWEEN, cutoffAt: CUTOFF, serviceDate: DATE, offers: [{ qty_ouverte: 2, qty_vendue: 2 }] })).toBe(false)
    })
  })
})
