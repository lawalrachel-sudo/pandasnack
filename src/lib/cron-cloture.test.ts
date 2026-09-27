import { describe, expect, it } from "vitest"
import { planForJob, isEmptyZ, closingYearStart } from "./cron-cloture"
import { addDays, monthStart, yearStart, previousDay, martiniqueToday } from "./caisse-date"

describe("caisse-date — fuseau America/Martinique (UTC-4)", () => {
  it("23:30 Martinique = même jour civil", () => {
    // 03:30 UTC le 28 → 23:30 Martinique le 27
    expect(martiniqueToday(new Date("2026-09-28T03:30:00Z"))).toBe("2026-09-27")
  })
  it("00:30 Martinique = jour suivant", () => {
    // 04:30 UTC le 28 → 00:30 Martinique le 28
    expect(martiniqueToday(new Date("2026-09-28T04:30:00Z"))).toBe("2026-09-28")
  })
  it("03:30 UTC → jour Martinique = veille de la date UTC", () => {
    expect(martiniqueToday(new Date("2026-09-28T03:30:00Z"))).toBe("2026-09-27")
    // pas d'heure d'été : même décalage en plein hiver
    expect(martiniqueToday(new Date("2026-01-15T03:30:00Z"))).toBe("2026-01-14")
  })
  it("addDays traverse les mois sans dérive", () => {
    expect(addDays("2026-09-26", -6)).toBe("2026-09-20")
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31")
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01")
  })
  it("monthStart / yearStart / previousDay", () => {
    expect(monthStart("2026-09-26")).toBe("2026-09-01")
    expect(yearStart("2026-09-26")).toBe("2026-01-01")
    expect(previousDay("2026-01-01")).toBe("2025-12-31")
  })
})

describe("cron-cloture — plan (instants fixes, jours Martinique)", () => {
  it("jour à 03:30 UTC : clôture le jour Martinique courant (veille UTC)", () => {
    expect(planForJob("jour", new Date("2026-09-28T03:30:00Z")))
      .toEqual({ type: "jour", start: "2026-09-27", onlyIfActivity: true })
  })
  it("mois le 1er à 04:00 UTC : clôture le mois qui vient de se terminer", () => {
    // 04:00 UTC 1er oct → 00:00 Martinique 1er oct → clôture septembre
    expect(planForJob("mois", new Date("2026-10-01T04:00:00Z")))
      .toEqual({ type: "mois", start: "2026-09-01", onlyIfActivity: false })
    // passage d'année : 1er janv → clôture décembre
    expect(planForJob("mois", new Date("2026-01-01T04:00:00Z")))
      .toEqual({ type: "mois", start: "2025-12-01", onlyIfActivity: false })
  })
  it("annee le 1er janvier à 04:30 UTC : clôture l'année précédente", () => {
    // 04:30 UTC 1er janv → 00:30 Martinique 1er janv → clôture 2025
    expect(planForJob("annee", new Date("2026-01-01T04:30:00Z")))
      .toEqual({ type: "annee", start: "2025-01-01", onlyIfActivity: false })
  })
  it("annee : null hors du jour CLOSING_YEAR_START (Martinique)", () => {
    expect(planForJob("annee", new Date("2026-06-15T04:30:00Z"))).toBeNull()
    // exercice décalé au 1er septembre
    expect(planForJob("annee", new Date("2026-09-01T04:30:00Z"), "09-01"))
      .toEqual({ type: "annee", start: "2025-09-01", onlyIfActivity: false })
  })
  it("closingYearStart applique MM-JJ", () => {
    expect(closingYearStart("2026-05-03")).toBe("2026-01-01")
    expect(closingYearStart("2026-05-03", "09-01")).toBe("2026-09-01")
  })
})

describe("cron-cloture — isEmptyZ", () => {
  const base = {
    precommandes: { nb: 0 }, comptoir: { nb: 0, nb_annulations: 0, jetons_qty: 0 }, totaux: { ttc: 0 },
  }
  it("vide si aucune activité", () => {
    expect(isEmptyZ(null)).toBe(true)
    expect(isEmptyZ(base)).toBe(true)
  })
  it("non vide si commande, vente, TTC ou jeton", () => {
    expect(isEmptyZ({ ...base, precommandes: { nb: 1 } })).toBe(false)
    expect(isEmptyZ({ ...base, totaux: { ttc: 500 } })).toBe(false)
    expect(isEmptyZ({ ...base, comptoir: { nb: 0, nb_annulations: 0, jetons_qty: 3 } })).toBe(false)
  })
})
