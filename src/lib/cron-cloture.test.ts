import { describe, expect, it } from "vitest"
import { planForJob, isEmptyZ, closingYearStart } from "./cron-cloture"
import { addDays, monthStart, yearStart, previousDay, parisToday } from "./caisse-date"

describe("caisse-date", () => {
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
  it("parisToday renvoie un AAAA-MM-JJ", () => {
    expect(parisToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("cron-cloture — plan", () => {
  it("jour : clôture la veille, si activité", () => {
    expect(planForJob("jour", "2026-09-27")).toEqual({ type: "jour", start: "2026-09-26", onlyIfActivity: true })
  })
  it("mois : seulement le 1er, clôture le mois précédent", () => {
    expect(planForJob("mois", "2026-10-01")).toEqual({ type: "mois", start: "2026-09-01", onlyIfActivity: false })
    expect(planForJob("mois", "2026-01-01")).toEqual({ type: "mois", start: "2025-12-01", onlyIfActivity: false })
    expect(planForJob("mois", "2026-10-02")).toBeNull()
  })
  it("annee : seulement le jour CLOSING_YEAR_START, clôture l'année précédente", () => {
    expect(planForJob("annee", "2026-01-01")).toEqual({ type: "annee", start: "2025-01-01", onlyIfActivity: false })
    expect(planForJob("annee", "2026-06-15")).toBeNull()
    // Exercice décalé au 1er septembre
    expect(planForJob("annee", "2026-09-01", "09-01")).toEqual({ type: "annee", start: "2025-09-01", onlyIfActivity: false })
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
