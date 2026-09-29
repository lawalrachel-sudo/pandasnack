import { describe, expect, it } from "vitest"
import { visForDevoirs } from "./visibility"

describe("visForDevoirs (PS-10a)", () => {
  it("visible seulement si sellable_devoirs && actif", () => {
    expect(visForDevoirs({ sku: "SAND-A", active: true, sellable_devoirs: true })).toBe(true)
    expect(visForDevoirs({ sku: "SAND-A", active: false, sellable_devoirs: true })).toBe(false)
    expect(visForDevoirs({ sku: "DRINK-BBL", active: true, sellable_devoirs: false })).toBe(false)
    expect(visForDevoirs({ sku: "X", active: true })).toBe(false)
  })
  it("jamais une variante ni un comptoir-only", () => {
    expect(visForDevoirs({ sku: "V", active: true, sellable_devoirs: true, parent_id: "p" })).toBe(false)
    expect(visForDevoirs({ sku: "C", active: true, sellable_devoirs: true, sellable_comptoir: true, sellable_alone: false, sellable_in_menu: false })).toBe(false)
  })
})

import { visForSource } from "./visibility"
describe("non-régression pandattitude (PS-10b) — sellable_devoirs n'affecte pas la carte midi", () => {
  it("un article reste visible/invisible en pandattitude quel que soit sellable_devoirs", () => {
    const base = { sku: "SAND-A", active: true }
    expect(visForSource({ ...base }, "pandattitude")).toBe(visForSource({ ...base, sellable_devoirs: true }, "pandattitude"))
    const bbl = { sku: "DRINK-BBL", active: true, sellable_comptoir: true, sellable_alone: true, sellable_in_menu: true }
    expect(visForSource({ ...bbl }, "pandattitude")).toBe(visForSource({ ...bbl, sellable_devoirs: true }, "pandattitude"))
  })
})
