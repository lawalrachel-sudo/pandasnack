import { beforeEach, describe, expect, it, vi } from "vitest"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpcArg: null as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpcResult: { data: [{ order_id: "o1", order_number: "PS-20261006-0001", total_cents: 250, wallet_balance_after: 9750 }] as any, error: null as any },
}))

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rpc: async (_name: string, args: any) => { mocks.rpcArg = args; return mocks.rpcResult },
  }),
}))
vi.mock("@/lib/notify", () => ({ notifyNewOrder: async () => ({ sent: false }) }))

import { POST } from "./route"

const call = (body: unknown) =>
  POST(new Request("http://x/api/sa-ki-ni/commander", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) as never)

const item = { catalog_item_id: "c1", profil_id: "p1", is_formula: false }

beforeEach(() => {
  mocks.user = { id: "u1" }
  mocks.rpcArg = null
  mocks.rpcResult = { data: [{ order_id: "o1", order_number: "PS-20261006-0001", total_cents: 250, wallet_balance_after: 9750 }], error: null }
})

describe("POST /api/sa-ki-ni/commander (PS-14b)", () => {
  it("un supplément forgé dans le body est IGNORÉ (jamais transmis à la RPC)", async () => {
    await call({ slotId: "s1", items: [item], supplement_cents: 9999 })
    expect(mocks.rpcArg).toBeTruthy()
    expect("supplement_cents" in mocks.rpcArg.p_payload).toBe(false)
  })

  it("commande OK → renvoie le numéro et le solde", async () => {
    const r = await call({ slotId: "s1", items: [item] })
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.ok).toBe(true)
    expect(j.orderNumber).toBe("PS-20261006-0001")
    expect(j.walletBalanceAfter).toBe(9750)
  })

  it("formule hors MENU_PANDA (SKN_FORMULE) → 400 + code mappé", async () => {
    mocks.rpcResult = { data: null, error: { message: "SKN_FORMULE" } }
    const r = await call({ slotId: "s1", items: [{ ...item, is_formula: true, menu_formula_id: "autre" }] })
    const j = await r.json()
    expect(r.status).toBe(400)
    expect(j.code).toBe("SKN_FORMULE")
  })

  it("solde insuffisant → 402 + lien de recharge côté client", async () => {
    mocks.rpcResult = { data: null, error: { message: "SOLDE_INSUFFISANT" } }
    const r = await call({ slotId: "s1", items: [item] })
    expect(r.status).toBe(402)
    expect((await r.json()).code).toBe("SOLDE_INSUFFISANT")
  })

  it("non authentifié → 401", async () => {
    mocks.user = null
    expect((await call({ slotId: "s1", items: [item] })).status).toBe(401)
  })
})
