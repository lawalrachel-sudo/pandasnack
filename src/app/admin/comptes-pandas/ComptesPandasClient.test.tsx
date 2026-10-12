// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ComptesPandasClient } from "./ComptesPandasClient"

const DRY_23 = {
  annee: "2026-2027", elevesAnnee: 34, comptesExistants: 9, comptesACreer: 23, profilsACreer: 25,
  ambigus: [{ prenom: "Sofia", nom: "Lebailly", classe: "Mer 3D + Sam Dessin", jour: "mercredi" }],
}
const DRY_0 = { annee: "2026-2027", elevesAnnee: 34, comptesExistants: 34, comptesACreer: 0, profilsACreer: 0, ambigus: [] }

function mockFetch(dry: unknown, post?: unknown) {
  return vi.fn(async (_url: string, opts?: { method?: string }) => {
    const body = opts?.method === "POST" ? (post ?? { executed: true, comptesCrees: 23, lignesSync: 34 }) : dry
    return { ok: true, json: async () => body } as Response
  })
}

afterEach(cleanup)
beforeEach(() => { vi.restoreAllMocks() })

describe("ComptesPandasClient (PS-20b)", () => {
  it("affiche le dry-run : comptes/profils à créer et Sofia « mercredi + samedi »", async () => {
    vi.stubGlobal("fetch", mockFetch(DRY_23))
    render(<ComptesPandasClient />)
    expect(await screen.findByText("23")).toBeTruthy()
    expect(screen.getByText("25")).toBeTruthy()
    expect(screen.getByText("comptes à créer")).toBeTruthy()
    expect(screen.getByText("mercredi + samedi")).toBeTruthy()
    expect(screen.queryByText(/ambigu/i)).toBeNull()
  })

  it("le POST n'est lancé qu'après confirmation", async () => {
    const f = mockFetch(DRY_23)
    vi.stubGlobal("fetch", f)
    render(<ComptesPandasClient />)
    fireEvent.click(await screen.findByText(/Créer les comptes/))
    // feuille de confirmation visible, toujours aucun POST
    expect(screen.getByText(/23 comptes et 25 profils vont être créés/)).toBeTruthy()
    expect(f.mock.calls.some((c) => c[1]?.method === "POST")).toBe(false)
    // confirmation → POST
    fireEvent.click(screen.getByText("Oui, créer"))
    await waitFor(() => expect(f.mock.calls.some((c) => c[1]?.method === "POST")).toBe(true))
  })

  it("affiche le résultat après création", async () => {
    vi.stubGlobal("fetch", mockFetch(DRY_23, { executed: true, comptesCrees: 23, lignesSync: 34 }))
    render(<ComptesPandasClient />)
    fireEvent.click(await screen.findByText(/Créer les comptes/))
    fireEvent.click(screen.getByText("Oui, créer"))
    expect(await screen.findByText(/23 comptes créés/)).toBeTruthy()
  })

  it("0 à créer : message et bouton désactivé", async () => {
    vi.stubGlobal("fetch", mockFetch(DRY_0))
    render(<ComptesPandasClient />)
    expect(await screen.findByText("Tous les Pandas inscrits ont leur compte.")).toBeTruthy()
    const btn = screen.getByText("Créer les comptes") as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
