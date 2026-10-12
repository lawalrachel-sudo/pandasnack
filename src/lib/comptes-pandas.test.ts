import { describe, expect, it } from "vitest"
import { joursLabel, confirmText } from "./comptes-pandas"

describe("comptes-pandas (PS-20b)", () => {
  it("joursLabel : un seul jour", () => {
    expect(joursLabel("Mer 3D")).toBe("mercredi")
    expect(joursLabel("Sam Dessin")).toBe("samedi")
  })
  it("joursLabel : deux jours (Sofia) → « mercredi + samedi », jamais « ambigu »", () => {
    expect(joursLabel("Mer 3D + Sam Dessin")).toBe("mercredi + samedi")
  })
  it("joursLabel : même jour répété → une fois", () => {
    expect(joursLabel("Sam 3D + Sam Dessin")).toBe("samedi")
  })
  it("joursLabel : rien de reconnu → tiret", () => {
    expect(joursLabel(null)).toBe("—")
    expect(joursLabel("Stage")).toBe("—")
  })
  it("confirmText : accords singulier/pluriel", () => {
    expect(confirmText(23, 25)).toBe("23 comptes et 25 profils vont être créés. Aucun e-mail n'est envoyé aux familles.")
    expect(confirmText(1, 1)).toBe("1 compte et 1 profil vont être créés. Aucun e-mail n'est envoyé aux familles.")
  })
})
