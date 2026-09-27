import { describe, expect, it } from "vitest"
import { isArchivable, isChildActiveProfil, shouldReactivateOnProfil } from "./account-archive"

const enfantActif = { type_profil: "eleve", active: true, archived_at: null }
const enfantInactif = { type_profil: "eleve", active: false, archived_at: null }
const enfantArchive = { type_profil: "eleve", active: true, archived_at: "2026-05-01T00:00:00Z" }
const parent = { type_profil: "adulte", active: true, archived_at: null }

describe("isArchivable (PS-06f)", () => {
  it("compte sans profil enfant actif → archivable", () => {
    expect(isArchivable({}, [])).toBe(true)
    expect(isArchivable({}, [parent])).toBe(true)
    expect(isArchivable({}, [enfantInactif])).toBe(true)
    expect(isArchivable({}, [enfantArchive])).toBe(true)
  })
  it("compte avec un profil enfant actif → NON archivable", () => {
    expect(isArchivable({}, [enfantActif])).toBe(false)
    expect(isArchivable({}, [parent, enfantActif])).toBe(false)
  })
  it("admin jamais archivable", () => {
    expect(isArchivable({ is_admin: true }, [])).toBe(false)
  })
  it("compte de test jamais archivable", () => {
    expect(isArchivable({ is_test: true }, [])).toBe(false)
  })
})

describe("isChildActiveProfil", () => {
  it("vrai seulement pour un enfant actif non archivé", () => {
    expect(isChildActiveProfil(enfantActif)).toBe(true)
    expect(isChildActiveProfil(enfantInactif)).toBe(false)
    expect(isChildActiveProfil(enfantArchive)).toBe(false)
    expect(isChildActiveProfil(parent)).toBe(false)
  })
})

describe("shouldReactivateOnProfil", () => {
  it("réactive sur un enfant actif, pas sur les autres", () => {
    expect(shouldReactivateOnProfil(enfantActif)).toBe(true)
    expect(shouldReactivateOnProfil(enfantInactif)).toBe(false)
    expect(shouldReactivateOnProfil(parent)).toBe(false)
  })
})
