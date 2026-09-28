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
