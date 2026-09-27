import { describe, expect, it } from "vitest"
import { visForSource } from "./visibility"

describe("visForSource — garde comptoir (PS-08a)", () => {
  it("un article GOUTER comptoir-only est invisible en précommande", () => {
    expect(visForSource(
      { sku: "GOUT-BISCUIT-ab12", active: true, sellable_comptoir: true, sellable_alone: false, sellable_in_menu: false },
      "pandattitude"
    )).toBe(false)
  })
  it("DRINK-BBL (comptoir ET vendable) reste visible (flags indépendants)", () => {
    expect(visForSource(
      { sku: "DRINK-BBL", active: true, sellable_comptoir: true, sellable_alone: true, sellable_in_menu: true },
      "pandattitude"
    )).toBe(true)
  })
  it("un article normal sans flag comptoir n'est pas affecté", () => {
    expect(visForSource({ sku: "SAND-A", active: true }, "pandattitude")).toBe(true)
  })
})
