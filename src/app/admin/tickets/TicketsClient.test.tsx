// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { TicketsClient } from "./TicketsClient"

function mockFetch(post?: unknown) {
  return vi.fn(async (_url: string, opts?: { method?: string }) => {
    const body = opts?.method === "POST" ? (post ?? { ok: true, id: "t1", statut: "a_envoyer", lignes: 0 }) : { tickets: [] }
    return { ok: true, json: async () => body } as Response
  })
}

afterEach(cleanup)
beforeEach(() => { vi.restoreAllMocks() })

describe("TicketsClient (PS-22)", () => {
  it("bouton Enregistrer désactivé tant qu'aucune catégorie n'est choisie", async () => {
    vi.stubGlobal("fetch", mockFetch())
    render(<TicketsClient />)
    const btn = await screen.findByText("Enregistrer le ticket") as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(screen.getByText("Pro Snack"))
    expect((screen.getByText("Enregistrer le ticket") as HTMLButtonElement).disabled).toBe(false)
  })

  it("Perso affiche la note « jamais envoyé à Pennylane » et aucune note d'envoi", async () => {
    vi.stubGlobal("fetch", mockFetch())
    render(<TicketsClient />)
    await screen.findByText("Enregistrer le ticket")
    fireEvent.click(screen.getByText("Perso"))
    expect(screen.getByText(/jamais envoyé à Pennylane/)).toBeTruthy()
    expect(screen.queryByText(/Envoi vers Pennylane/)).toBeNull()
  })

  it("POST déclenché à l'enregistrement avec la catégorie choisie", async () => {
    const f = mockFetch()
    vi.stubGlobal("fetch", f)
    render(<TicketsClient />)
    await screen.findByText("Enregistrer le ticket")
    fireEvent.click(screen.getByText("Pro Snack"))
    fireEvent.click(screen.getByText("Enregistrer le ticket"))
    await waitFor(() => {
      const post = f.mock.calls.find((c) => c[1]?.method === "POST")
      expect(post).toBeTruthy()
      expect(JSON.parse((post![1] as { body: string }).body).categorie).toBe("pro_snack")
    })
  })
})
