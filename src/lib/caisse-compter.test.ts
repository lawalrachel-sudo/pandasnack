import { describe, expect, it } from "vitest"
import { aCompter, nbACompter, ecartCents, especesDuJour } from "./caisse-compter"

const base = (over: Partial<Parameters<typeof aCompter>[0][number]>) => ({
  id: "x", period_type: "jour", period_start: "2026-10-07", cash_expected_cents: 250, cash_counted_at: null, ...over,
})

describe("caisse-compter (PS-24)", () => {
  it("exclut les journées déjà comptées et les is_test ; garde les jour non comptées", () => {
    const rows = [
      base({ id: "a", period_start: "2026-10-07" }),
      base({ id: "b", period_start: "2026-10-05" }),
      base({ id: "c", cash_counted_at: "2026-10-08T00:00:00Z" }), // déjà compté
      base({ id: "d", is_test: true }),                            // test
      base({ id: "e", period_type: "mois" }),                      // pas un jour
    ]
    expect(nbACompter(rows)).toBe(2)
    expect(aCompter(rows).map((r) => r.id)).toEqual(["b", "a"]) // plus ancienne d'abord
  })
  it("écart = compté − attendu ; null si rien compté", () => {
    expect(ecartCents(250, 250)).toBe(0)
    expect(ecartCents(300, 250)).toBe(50)
    expect(ecartCents(200, 250)).toBe(-50)
    expect(ecartCents(null, 250)).toBe(null)
  })
  it("espèces du jour depuis le Z", () => {
    expect(especesDuJour({ totaux: { ttc_par_mode: { especes: 250 } }, comptoir: { nb: 3 } }))
      .toEqual({ total_cents: 250, comptoir_nb: 3 })
    expect(especesDuJour(null)).toEqual({ total_cents: 0, comptoir_nb: 0 })
  })
})
