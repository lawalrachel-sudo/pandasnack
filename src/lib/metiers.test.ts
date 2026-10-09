import { describe, expect, it } from "vitest"
import { METIER_FILTERS, HIDDEN_METIERS, metierOfOrder, orderMatchesMetier, metierLabel, metierEtiquette } from "./metiers"

describe("métiers (PS-13b)", () => {
  it("options : TOUS, Pandattitude, Panda Devoirs, Stage", () => {
    expect(METIER_FILTERS.map((f) => f.value)).toEqual(["", "pandattitude", "panda_devoirs", "stage"])
  })
  it("anciens métiers masqués des menus", () => {
    for (const m of ["ecole_la_patience", "panda_guest", "ecole", "coffret_bureau", "divers"]) {
      expect(HIDDEN_METIERS).toContain(m)
      expect(METIER_FILTERS.some((f) => f.value === m)).toBe(false)
    }
  })
  it("metierOfOrder : devoirs par slot OU compte panda_devoirs", () => {
    expect(metierOfOrder({ day_type: "devoirs", source_group: "pandattitude" })).toBe("panda_devoirs")
    expect(metierOfOrder({ day_type: "mercredi", source_group: "panda_devoirs" })).toBe("panda_devoirs")
    expect(metierOfOrder({ day_type: "mercredi", source_group: "pandattitude" })).toBe("pandattitude")
  })
  it("orderMatchesMetier : TOUS inclut tout ; filtre devoirs ne prend que devoirs", () => {
    const dev = { day_type: "devoirs", source_group: "pandattitude" }
    const midi = { day_type: "mercredi", source_group: "pandattitude" }
    expect(orderMatchesMetier(dev, "")).toBe(true)
    expect(orderMatchesMetier(midi, "")).toBe(true)
    expect(orderMatchesMetier(dev, "panda_devoirs")).toBe(true)
    expect(orderMatchesMetier(midi, "panda_devoirs")).toBe(false)
    expect(orderMatchesMetier(midi, "pandattitude")).toBe(true)
  })
  it("PS-17 — stage : metierOfOrder='stage' + en-tête étiquette « STAGE »", () => {
    expect(metierOfOrder({ day_type: "stage", source_group: "pandattitude" })).toBe("stage")
    expect(metierEtiquette("stage")).toBe("Stage")
    expect(metierEtiquette("stage").toUpperCase()).toBe("STAGE")
    expect(orderMatchesMetier({ day_type: "stage", source_group: "pandattitude" }, "stage")).toBe(true)
    expect(orderMatchesMetier({ day_type: "mercredi", source_group: "pandattitude" }, "stage")).toBe(false)
  })

  it("libellés historiques restent lisibles", () => {
    expect(metierLabel("ecole_la_patience")).toBe("École La Patience")
    expect(metierLabel("panda_guest")).toBe("Panda Guest")
    expect(metierEtiquette("panda_devoirs")).toBe("Devoirs")
    expect(metierEtiquette("pandattitude")).toBe("Pandattitude")
  })
})
