import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isAdmin: true,
  targets: [] as Array<{ id: string; email: string | null; nom_compte: string | null; is_test: boolean }>,
  verifyErr: null as unknown,
  signOutCalled: false,
}))

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: async () => (mocks.isAdmin ? { user: null } : { error: new Response("unauth", { status: 401 }) }),
}))
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: {
      verifyOtp: async () => ({ error: mocks.verifyErr }),
      getUser: async () => ({ data: { user: { id: "u1", email: "t@test" } } }),
      signOut: async () => { mocks.signOutCalled = true; return { error: null } },
    },
  }),
}))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function builderFor(table: string): any {
  const res = table === "accounts" ? { data: mocks.targets }
    : table === "profils" ? { data: { prenom: "Loulou" } }
    : { data: null, error: null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b, eq: () => b, order: () => b, limit: () => b,
    maybeSingle: async () => res, insert: async () => ({ error: null }),
    then: (resolve: (v: unknown) => void) => resolve(res),
  }
  return b
}
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (t: string) => builderFor(t),
    auth: { admin: { generateLink: async () => ({ data: { properties: { hashed_token: "tok" } }, error: null }) } },
  }),
}))
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => {} }) }))

import { POST as enter } from "./route"
import { POST as exit } from "./exit/route"

const call = async (fn: () => Promise<Response>) => { const r = await fn(); return { status: r.status, body: await r.json().catch(() => ({})) } }
const enterWith = (accountId?: string) => enter(new Request("http://x", { method: "POST", body: JSON.stringify({ accountId }), headers: { "Content-Type": "application/json" } }) as never)

beforeEach(() => { mocks.isAdmin = true; mocks.targets = []; mocks.verifyErr = null; mocks.signOutCalled = false })

describe("POST /api/admin/impersonate (PS-13)", () => {
  it("non-admin → 401", async () => {
    mocks.isAdmin = false
    expect((await call(() => enterWith("acc-x"))).status).toBe(401)
  })

  it("cible NON-test → 403 (aucune session ouverte)", async () => {
    mocks.targets = [] // eq(is_test,true)+eq(id) ne renvoie rien → cible non autorisée
    const r = await call(() => enterWith("acc-nontest"))
    expect(r.status).toBe(403)
  })

  it("cible test → session ouverte + redirection /commander", async () => {
    mocks.targets = [{ id: "acc-test", email: "t@test", nom_compte: "Test", is_test: true }]
    const r = await call(() => enterWith("acc-test"))
    expect(r.status).toBe(200)
    expect(r.body.redirect).toBe("/commander")
  })

  it("erreur de session (verifyOtp) → 500", async () => {
    mocks.targets = [{ id: "acc-test", email: "t@test", nom_compte: "Test", is_test: true }]
    mocks.verifyErr = { message: "boom" }
    expect((await call(() => enterWith("acc-test"))).status).toBe(500)
  })
})

describe("POST /api/admin/impersonate/exit (PS-13)", () => {
  it("ferme la session client (signOut) et renvoie /admin/home", async () => {
    const r = await call(() => exit())
    expect(r.status).toBe(200)
    expect(r.body.redirect).toBe("/admin/home")
    expect(mocks.signOutCalled).toBe(true)
  })
  it("non-admin → 401 (le cookie admin doit être intact)", async () => {
    mocks.isAdmin = false
    expect((await call(() => exit())).status).toBe(401)
  })
})
