import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isAdmin: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: { id: "o1", status: "paid", sa_ki_ni: true, total_cents: 250, payment_method: "wallet", account_id: "a1", order_number: "PS-1" } as any,
  rpcName: null as string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpcResult: { data: [{ order_id: "o1", refunded_cents: 250, portions_returned: 1 }], error: null as any },
}))

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: async () => (mocks.isAdmin ? { user: null } : { error: new Response("unauth", { status: 401 }) }),
}))
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({}) }))
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.order }), in: () => ({ select: async () => ({ data: [{ id: "o1" }] }) }) }) }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rpc: async (name: string) => { mocks.rpcName = name; return mocks.rpcResult },
  }),
}))

import { POST } from "./route"

const call = (body: unknown) =>
  POST(new Request("http://x/api/admin/orders/cancel", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) as never)

beforeEach(() => {
  mocks.isAdmin = true
  mocks.order = { id: "o1", status: "paid", sa_ki_ni: true, total_cents: 250, payment_method: "wallet", account_id: "a1", order_number: "PS-1" }
  mocks.rpcName = null
  mocks.rpcResult = { data: [{ order_id: "o1", refunded_cents: 250, portions_returned: 1 }], error: null }
})

describe("POST /api/admin/orders/cancel (PS-14b)", () => {
  it("non-admin (ex. parent) → 401 : pas d'accès au reverse par ce chemin", async () => {
    mocks.isAdmin = false
    expect((await call({ orderId: "o1" })).status).toBe(401)
  })

  it("commande Sa ki ni → passe par sa_ki_ni_reverse (recrédit + portion rendue)", async () => {
    const r = await call({ orderId: "o1" })
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(mocks.rpcName).toBe("sa_ki_ni_reverse")
    expect(j.saKiNi).toBe(true)
    expect(j.refundedCents).toBe(250)
    expect(j.portionsReturned).toBe(1)
  })

  it("orderId manquant → 400", async () => {
    expect((await call({})).status).toBe(400)
  })
})
