import { describe, expect, it } from "vitest"
import { pickHero } from "./hero-priority"
import { stageDisplayState } from "./stage-state"

describe("PS-17 — pickHero (priorité un seul hero)", () => {
  it("Sa ki ni l'emporte sur Stage et maison", () => {
    expect(pickHero({ saKiNiActive: true, stageActive: true, maisonActive: true })).toBe("sakini")
  })
  it("Stage l'emporte sur maison quand pas de Sa ki ni", () => {
    expect(pickHero({ saKiNiActive: false, stageActive: true, maisonActive: true })).toBe("stage")
  })
  it("maison en dernier recours", () => {
    expect(pickHero({ stageActive: false, maisonActive: true })).toBe("maison")
  })
  it("rien d'actif → null", () => {
    expect(pickHero({})).toBe(null)
  })
})

describe("PS-17 — stageDisplayState (dérivé des créneaux actifs, sans date en dur)", () => {
  const WEEK = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]
  it("avant la semaine : hero annoncé, bandeau pas encore", () => {
    const s = stageDisplayState(WEEK, "2026-10-20")
    expect(s.heroUpcoming).toBe(true); expect(s.weekNow).toBe(false)
  })
  it("pendant la semaine : hero + bandeau", () => {
    const s = stageDisplayState(WEEK, "2026-10-28")
    expect(s.heroUpcoming).toBe(true); expect(s.weekNow).toBe(true)
  })
  it("après la semaine : plus rien", () => {
    const s = stageDisplayState(WEEK, "2026-10-31")
    expect(s.heroUpcoming).toBe(false); expect(s.weekNow).toBe(false)
  })
  it("aucun créneau actif → plus rien", () => {
    const s = stageDisplayState([], "2026-10-28")
    expect(s.heroUpcoming).toBe(false); expect(s.weekNow).toBe(false)
  })
})
