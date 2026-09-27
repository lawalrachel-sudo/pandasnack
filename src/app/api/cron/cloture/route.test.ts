import { beforeEach, describe, expect, it, vi } from "vitest"

// Le cron construit son client service_role via @supabase/supabase-js. On mocke rpc.
const mocks = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: vi.fn(async (_fn: string, _args: unknown): Promise<{ data: any; error: any }> => ({ data: null, error: null })),
}))
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }))
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co")
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc")
vi.stubEnv("CRON_SECRET", "topsecret")

import { GET } from "./route"

function req(url: string, bearer?: string) {
  return new Request(url, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} })
}
const call = async (url: string, bearer?: string) => {
  const res = await GET(req(url, bearer))
  return { status: res.status, body: await res.json() }
}

beforeEach(() => { mocks.rpc.mockClear() })

describe("GET /api/cron/cloture — sécurité", () => {
  it("401 sans Authorization", async () => {
    const r = await call("http://localhost/api/cron/cloture?job=jour")
    expect(r.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("401 avec mauvais secret", async () => {
    const r = await call("http://localhost/api/cron/cloture?job=jour", "wrong")
    expect(r.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("400 sur un job invalide", async () => {
    const r = await call("http://localhost/api/cron/cloture?job=semaine", "topsecret")
    expect(r.status).toBe(400)
  })
})

describe("GET /api/cron/cloture — clôture", () => {
  it("jour : skip si aucune activité", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { precommandes: { nb: 0 }, comptoir: { nb: 0, nb_annulations: 0, jetons_qty: 0 }, totaux: { ttc: 0 } }, error: null })
    const r = await call("http://localhost/api/cron/cloture?job=jour", "topsecret")
    expect(r.status).toBe(200)
    expect(r.body.skipped).toBe(true)
    // caisse_z appelé, mais pas caisse_close
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc.mock.calls[0][0]).toBe("caisse_z")
  })
  it("jour : clôture si activité", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { precommandes: { nb: 2 }, comptoir: { nb: 0, nb_annulations: 0, jetons_qty: 0 }, totaux: { ttc: 1200 } }, error: null })
      .mockResolvedValueOnce({ data: { id: "clo-1" }, error: null })
    const r = await call("http://localhost/api/cron/cloture?job=jour", "topsecret")
    expect(r.status).toBe(200)
    expect(r.body.success).toBe(true)
    expect(mocks.rpc.mock.calls[1][0]).toBe("caisse_close")
    expect((mocks.rpc.mock.calls[1][1] as { p_type: string }).p_type).toBe("jour")
  })
})
