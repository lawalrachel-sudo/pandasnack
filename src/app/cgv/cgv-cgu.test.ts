import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { CURRENT_CGU_VERSION } from "@/lib/legal"

// PS-05d-a — correction minimale de texte CGV/CGU, sans nouvelle acceptation.
const cgv = readFileSync(join(process.cwd(), "src/app/cgv/page.tsx"), "utf8")
const cgu = readFileSync(join(process.cwd(), "src/app/cgu/page.tsx"), "utf8")

describe("CGV/CGU (PS-05d-a)", () => {
  it("ne mentionnent plus « 30 juin 2026 »", () => {
    expect(cgv).not.toContain("30 juin 2026")
    expect(cgu).not.toContain("30 juin 2026")
  })

  it("ne mentionnent plus « vercel.app »", () => {
    expect(cgv).not.toMatch(/vercel\.app/)
    expect(cgu).not.toMatch(/vercel\.app/)
    expect(cgv).toContain("pandasnack.online")
  })

  it("validité du wallet = fin de l'année scolaire en cours", () => {
    expect(cgv).toContain("à la fin de l&apos;année scolaire en cours (30 juin)")
  })

  it("date de mise à jour = jour du merge (26 septembre 2026)", () => {
    expect(cgv).toContain("Dernière mise à jour : 26 septembre 2026")
    expect(cgu).toContain("Dernière mise à jour : 26 septembre 2026")
  })

  it("la version CGU n'est PAS modifiée (pas de nouvelle acceptation)", () => {
    expect(CURRENT_CGU_VERSION).toBe("2026-04-27")
  })
})
