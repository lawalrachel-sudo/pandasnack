import { describe, expect, it } from "vitest"
import { bonusForAmount, creditDescription, planCredit, type RechargeTier } from "./wallet-bonus"

// Grille réelle (wallet_recharge_config) : 30→1,50 ; 50→5 ; 100→15 ; 200→40 (inactif).
const TIERS: RechargeTier[] = [
  { recharge_cents: 3000, bonus_cents: 150, active: true },
  { recharge_cents: 5000, bonus_cents: 500, active: true },
  { recharge_cents: 10000, bonus_cents: 1500, active: true },
  { recharge_cents: 20000, bonus_cents: 4000, active: false },
]

describe("bonusForAmount", () => {
  it("50 € → +5 €", () => expect(bonusForAmount(5000, TIERS)).toBe(500))
  it("100 € → +15 €", () => expect(bonusForAmount(10000, TIERS)).toBe(1500))
  it("70 € → +5 € (palier 50 atteint, pas 100)", () => expect(bonusForAmount(7000, TIERS)).toBe(500))
  it("30 € → 0 (sous le seuil de rappel, pas de bonus proposé)", () => expect(bonusForAmount(3000, TIERS)).toBe(0))
  it("49,99 € → 0", () => expect(bonusForAmount(4999, TIERS)).toBe(0))
  it("250 € → +15 € (palier 200 inactif ignoré, on retombe sur 100)", () => expect(bonusForAmount(25000, TIERS)).toBe(1500))
  it("montant nul ou négatif → 0", () => {
    expect(bonusForAmount(0, TIERS)).toBe(0)
    expect(bonusForAmount(-100, TIERS)).toBe(0)
  })
})

describe("creditDescription", () => {
  it("bonus explicite dans le libellé", () => {
    expect(creditDescription(5000, 500, "especes")).toBe("Recharge espèces 50,00 € + bonus 5,00 €")
  })
  it("sans bonus quand 0", () => {
    expect(creditDescription(3000, 0, "virement")).toBe("Recharge virement 30,00 €")
  })
  it("mode CB SumUp + note libre", () => {
    expect(creditDescription(5000, 500, "cb_sumup", "règlement Sofia")).toBe("Recharge CB SumUp 50,00 € + bonus 5,00 € (règlement Sofia)")
  })
})

describe("planCredit", () => {
  it("additionne montant + bonus au solde et au cumul crédité", () => {
    const p = planCredit({
      amountCents: 5000, bonusCents: 500, mode: "especes", note: null,
      currentBalanceCents: 1000, currentTotalCreditedCents: 20000,
    })
    expect(p.totalCreditCents).toBe(5500)
    expect(p.newBalanceCents).toBe(6500)
    expect(p.newTotalCreditedCents).toBe(25500)
    expect(p.description).toContain("+ bonus 5,00 €")
  })
  it("bonus décoché (0) : rien n'est ajouté au titre du bonus", () => {
    const p = planCredit({
      amountCents: 5000, bonusCents: 0, mode: "especes",
      currentBalanceCents: 0, currentTotalCreditedCents: 0,
    })
    expect(p.totalCreditCents).toBe(5000)
    expect(p.newBalanceCents).toBe(5000)
    expect(p.description).not.toContain("bonus")
  })
})
