import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ cookieValid: true, user: null as null | { id: string }, isAdmin: false }))

vi.mock("./admin-cookie", () => ({
  hasValidAdminCookie: async () => mocks.cookieValid,
}))

import { requireAdmin } from "./admin"

// Faux client Supabase : session présente mais compte NON-admin (scénario « vue client »).
function fakeSupabase() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: { is_admin: mocks.isAdmin } }) }
  return {
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    from: () => b,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

beforeEach(() => { mocks.cookieValid = true; mocks.user = null; mocks.isAdmin = false })

describe("PS-13c — requireAdmin : le cookie admin est autoritaire", () => {
  it("cookie valide → { user: null }, MÊME avec une session Supabase non-admin (vue client)", async () => {
    mocks.cookieValid = true
    mocks.user = { id: "test-account" } // session test connectée
    mocks.isAdmin = false               // ce compte n'est PAS admin
    const r = await requireAdmin(fakeSupabase())
    expect("user" in r && r.user === null).toBe(true) // accès accordé via cookie
  })

  it("pas de cookie + session non-admin → 403", async () => {
    mocks.cookieValid = false
    mocks.user = { id: "test-account" }
    mocks.isAdmin = false
    const r = await requireAdmin(fakeSupabase())
    expect("error" in r && r.error.status).toBe(403)
  })

  it("pas de cookie + aucune session → 401", async () => {
    mocks.cookieValid = false
    mocks.user = null
    const r = await requireAdmin(fakeSupabase())
    expect("error" in r && r.error.status).toBe(401)
  })
})
