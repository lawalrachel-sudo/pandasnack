import { describe, expect, it } from "vitest"
import { visForStageCarte, visForSource } from "./visibility"

// PS-16 — carte stage (froide) : visForStageCarte = visibilité publique ∩ sellable_stage.
describe("visForStageCarte (PS-16)", () => {
  it("sandwich/club flaggé stage + actif → visible", () => {
    expect(visForStageCarte({ sku: "SAND-A", active: true, sellable_stage: true, sellable_alone: true }, "pandattitude")).toBe(true)
    expect(visForStageCarte({ sku: "CLUB-THON", active: true, sellable_stage: true, sellable_in_menu: true }, "pandattitude")).toBe(true)
  })
  it("rien de chaud ni de non-flaggé : croque, pâtes, soupe, MINI → exclus", () => {
    expect(visForStageCarte({ sku: "CROQ-PANDA", active: true, sellable_stage: false }, "pandattitude")).toBe(false)
    expect(visForStageCarte({ sku: "PASTA-BOLO", active: true }, "pandattitude")).toBe(false)
    expect(visForStageCarte({ sku: "MINI-JAMBON-FROMAGE", active: true, sellable_stage: false }, "pandattitude")).toBe(false)
  })
  it("Bubble Tea seul → exclu de la précommande stage (pas sellable_stage)", () => {
    expect(visForStageCarte({ sku: "DRINK-BBL", active: true, sellable_stage: false }, "pandattitude")).toBe(false)
  })
  it("flaggé stage mais inactif → exclu", () => {
    expect(visForStageCarte({ sku: "SAND-A", active: false, sellable_stage: true }, "pandattitude")).toBe(false)
  })
})

describe("non-régression : hors stage, sellable_stage n'affecte pas la carte normale (PS-16)", () => {
  it("un croque reste visible en pandattitude normal quel que soit sellable_stage", () => {
    expect(visForSource({ sku: "CROQ-PANDA", active: true, sellable_stage: false }, "pandattitude")).toBe(true)
    expect(visForSource({ sku: "CROQ-PANDA", active: true, sellable_stage: true }, "pandattitude")).toBe(true)
  })
})
