import { describe, expect, it } from "vitest"
import { canSeeDevoirsSlots, canSeePandattitudeSlots } from "./devoirs"

describe("accès Panda Devoirs (PS-10a)", () => {
  it("compte panda_devoirs : voit devoirs, jamais pandattitude", () => {
    const a = { source_group: "panda_devoirs" }
    expect(canSeeDevoirsSlots(a, [])).toBe(true)
    expect(canSeePandattitudeSlots(a)).toBe(false)
  })
  it("compte pandattitude avec un profil actif devoirs : voit les deux", () => {
    const a = { source_group: "pandattitude" }
    expect(canSeeDevoirsSlots(a, [{ active: true, devoirs: true }])).toBe(true)
    expect(canSeePandattitudeSlots(a)).toBe(true)
  })
  it("compte pandattitude sans profil devoirs : pas de devoirs", () => {
    const a = { source_group: "pandattitude" }
    expect(canSeeDevoirsSlots(a, [{ active: true, devoirs: false }])).toBe(false)
    expect(canSeeDevoirsSlots(a, [{ active: false, devoirs: true }])).toBe(false) // profil devoirs mais inactif
    expect(canSeePandattitudeSlots(a)).toBe(true)
  })
})
