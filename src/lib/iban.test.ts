import { describe, expect, it } from "vitest"
import { isValidIban, maskIban, normalizeIban } from "./iban"

describe("IBAN (PS-09a)", () => {
  it("valide un IBAN correct (espaces tolérés)", () => {
    expect(isValidIban("FR14 2004 1010 0505 0001 3M02 606")).toBe(true)
    expect(isValidIban("FR7630006000011234567890189")).toBe(true)
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true)
  })
  it("refuse une clé invalide ou une structure incorrecte", () => {
    expect(isValidIban("FR7630006000011234567890188")).toBe(false) // mauvaise clé
    expect(isValidIban("FR76")).toBe(false)
    expect(isValidIban("BONJOUR")).toBe(false)
    expect(isValidIban("")).toBe(false)
  })
  it("masque en gardant 4 premiers + 4 derniers", () => {
    expect(maskIban("FR7630006000011234567890189")).toBe("FR76 •••• •••• 0189")
    expect(normalizeIban("fr76 3000 6000")).toBe("FR7630006000")
  })
})
