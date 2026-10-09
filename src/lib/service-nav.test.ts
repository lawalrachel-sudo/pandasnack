import { describe, expect, it } from "vitest"
import { resolveServiceNav } from "./service-nav"

describe("PS-17 — resolveServiceNav (nav ‹ › Service du jour)", () => {
  // mer/sam + 5 jours de stage lun→ven, triés par date
  const slots = [
    { service_date: "2026-10-22" }, // mer (avant stage)
    { service_date: "2026-10-26" }, // lun stage
    { service_date: "2026-10-27" }, // mar stage
    { service_date: "2026-10-28" }, // mer stage
    { service_date: "2026-10-29" }, // jeu stage
    { service_date: "2026-10-30" }, // ven stage
    { service_date: "2026-11-04" }, // mer reprise
  ]
  it("la nav atteint un lundi de stage et chaîne vers les autres jours de stage", () => {
    const r = resolveServiceNav(slots, "2026-10-26", "2026-10-20")
    expect(r.idx).toBe(1)
    expect(r.prev).toBe("2026-10-22")
    expect(r.next).toBe("2026-10-27") // mardi de stage
  })
  it("sans date demandée → prochain créneau >= aujourd'hui", () => {
    const r = resolveServiceNav(slots, null, "2026-10-28")
    expect(r.idx).toBe(3) // 28/10
  })
  it("tout passé → dernier créneau", () => {
    const r = resolveServiceNav(slots, null, "2026-12-01")
    expect(r.idx).toBe(slots.length - 1)
  })
  it("aucun créneau → idx -1", () => {
    expect(resolveServiceNav([], null, "2026-10-28").idx).toBe(-1)
  })
})
