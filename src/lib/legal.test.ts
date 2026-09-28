import { describe, expect, it } from "vitest"
import { CURRENT_CGU_VERSION, needsLegalAcceptance } from "./legal"

describe("gate d'acceptation légale (PS-09b)", () => {
  it("version courante = 2026-09-28", () => {
    expect(CURRENT_CGU_VERSION).toBe("2026-09-28")
  })
  it("ancienne acceptation → modale", () => {
    expect(needsLegalAcceptance("2026-04-27")).toBe(true)
    expect(needsLegalAcceptance(null)).toBe(true)
    expect(needsLegalAcceptance(undefined)).toBe(true)
  })
  it("version courante → passe (pas de modale)", () => {
    expect(needsLegalAcceptance("2026-09-28")).toBe(false)
  })
})
