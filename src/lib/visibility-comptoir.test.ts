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
  it("une variante (parent_id renseigné) est invisible en précommande (PS-08a-d)", () => {
    expect(visForSource(
      { sku: "GOUT-GLACE-vanille", active: true, sellable_comptoir: true, sellable_alone: false, sellable_in_menu: false, parent_id: "parent-uuid" },
      "pandattitude"
    )).toBe(false)
    // même si un flag vendable était (par erreur) posé, parent_id gagne
    expect(visForSource(
      { sku: "X-Y", active: true, sellable_alone: true, sellable_in_menu: true, parent_id: "p" },
      "pandattitude"
    )).toBe(false)
  })
})
