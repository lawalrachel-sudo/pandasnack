import { describe, expect, it } from "vitest"
import { isValidPlafond, plafondLabel } from "./plafond"

describe("plafond goûter (PS-08b)", () => {
  it("accepte null (illimité) et les multiples de 50 jusqu'à 2000", () => {
    expect(isValidPlafond(null)).toBe(true)
    expect(isValidPlafond(0)).toBe(true)
    expect(isValidPlafond(350)).toBe(true)
    expect(isValidPlafond(2000)).toBe(true)
  })
  it("refuse non-multiples de 50, négatifs, > 2000, non entiers", () => {
    expect(isValidPlafond(375)).toBe(false)
    expect(isValidPlafond(-50)).toBe(false)
    expect(isValidPlafond(2050)).toBe(false)
    expect(isValidPlafond(100.5)).toBe(false)
    expect(isValidPlafond("350")).toBe(false)
    expect(isValidPlafond(undefined)).toBe(false)
  })
  it("plafondLabel lisible", () => {
    expect(plafondLabel(null)).toBe("Illimité")
    expect(plafondLabel(350)).toBe("3,50 € / jour")
    expect(plafondLabel(0)).toBe("0,00 € / jour")
  })
})
