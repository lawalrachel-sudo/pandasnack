import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { CURRENT_CGU_VERSION } from "@/lib/legal"

// PS-09b — CGV/CGU révisées + nouvelle version.
const cgv = readFileSync(join(process.cwd(), "src/app/cgv/page.tsx"), "utf8")
const cgu = readFileSync(join(process.cwd(), "src/app/cgu/page.tsx"), "utf8")

describe("CGV/CGU (PS-09b)", () => {
  it("terminologie : jamais « Pass Panda », toujours « Panda Wallet »", () => {
    expect(cgv).not.toMatch(/pass panda/i)
    expect(cgu).not.toMatch(/pass panda/i)
    expect(cgv).toContain("Panda Wallet")
    expect(cgu).toContain("Panda Wallet")
  })

  it("connexion : plus de « lien magique »", () => {
    expect(cgv).not.toMatch(/lien magique/i)
    expect(cgu).not.toMatch(/lien magique/i)
    expect(cgv).toMatch(/Mot de passe\s+oubli/)
    expect(cgu).toMatch(/Mot de passe\s+oubli/)
  })

  it("domaine pandasnack.online, jamais vercel.app", () => {
    expect(cgv).toContain("pandasnack.online")
    expect(cgv).not.toMatch(/vercel\.app/)
    expect(cgu).not.toMatch(/vercel\.app/)
  })

  it("couvre les nouveaux articles : IBAN, bonus paliers, plafond, clôture 30 juin, départ, jetons", () => {
    expect(cgv).toContain("IBAN")
    expect(cgv).toContain("30 € rechargés = 1,50 € offerts")
    expect(cgv).toContain("50 € = 5 € offerts")
    expect(cgv).toContain("100 € = 15 € offerts")
    expect(cgv).toContain("consommé en premier")
    expect(cgv).toMatch(/plafond journalier/i)
    expect(cgv).toMatch(/30 juin/)
    expect(cgv).toMatch(/Jetons Bambou/i)
  })

  it("nouvelle version + date de mise en ligne", () => {
    expect(CURRENT_CGU_VERSION).toBe("2026-09-28")
    expect(cgv).toContain("Dernière mise à jour : 28 septembre 2026")
    expect(cgu).toContain("Dernière mise à jour : 28 septembre 2026")
  })

  it("sommaire cliquable en tête", () => {
    expect(cgv).toContain('href={`#${s.id}`}')
    expect(cgu).toContain('href={`#${s.id}`}')
  })
})
