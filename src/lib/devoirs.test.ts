import { describe, expect, it } from "vitest"
import { canSeeDevoirsSlots, canSeePandattitudeSlots, filterSlotsForAccount } from "./devoirs"

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

describe("filterSlotsForAccount (PS-10b — source unique des pilules)", () => {
  const midi = { id: "m", day_type: "mercredi", target_source_group: "pandattitude" }
  const dev = { id: "d", day_type: "devoirs", target_source_group: "panda_devoirs" }
  const slots = [midi, dev]
  it("pandattitude sans enfant devoirs → midi seul, aucun slot devoirs", () => {
    const r = filterSlotsForAccount(slots, { source_group: "pandattitude" }, [{ active: true, devoirs: false }])
    expect(r.map((s) => s.id)).toEqual(["m"])
  })
  it("pandattitude avec enfant devoirs → midi + devoirs", () => {
    const r = filterSlotsForAccount(slots, { source_group: "pandattitude" }, [{ active: true, devoirs: true }])
    expect(r.map((s) => s.id).sort()).toEqual(["d", "m"])
  })
  it("compte panda_devoirs → devoirs seul, aucun midi", () => {
    const r = filterSlotsForAccount(slots, { source_group: "panda_devoirs" }, [])
    expect(r.map((s) => s.id)).toEqual(["d"])
  })
})
