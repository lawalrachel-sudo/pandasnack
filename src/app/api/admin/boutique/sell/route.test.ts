import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({}) }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => ({ user: { id: "admin" } }) }))
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ rpc: mocks.rpc }) }))

import { POST as SELL } from "./route"
import { POST as REVERSE } from "../reverse/route"

const req = (body: unknown) => new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

beforeEach(() => mocks.rpc.mockReset())

describe("POST /api/admin/boutique/sell", () => {
  it("400 sans idempotency_key", async () => {
    const res = await SELL(req({ payment_mode: "wallet" }) as never)
    expect(res.status).toBe(400)
  })

  it("transmet le payload à comptoir_sell et renvoie la vente", async () => {
    mocks.rpc.mockResolvedValue({ data: { sale_number: "CPT-1", total_cents: 300 }, error: null })
    const payload = { idempotency_key: "k1", payment_mode: "wallet", items: [{ catalog_item_id: "a", qty: 2 }] }
    const res = await SELL(req(payload) as never)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.sale.sale_number).toBe("CPT-1")
    expect(mocks.rpc).toHaveBeenCalledWith("comptoir_sell", { payload })
  })

  it("mappe SOLDE_INSUFFISANT en message avec les montants", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "SOLDE_INSUFFISANT", details: JSON.stringify({ solde: 200, total: 300 }) } })
    const res = await SELL(req({ idempotency_key: "k", payment_mode: "wallet" }) as never)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe("SOLDE_INSUFFISANT")
    expect(body.error).toMatch(/Solde insuffisant.*SumUp/)
  })

  it("mappe PLAFOND et STOCK", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "PLAFOND", details: JSON.stringify({ consomme: 300, plafond: 300 }) } })
    expect((await (await SELL(req({ idempotency_key: "k", payment_mode: "wallet" }) as never)).json()).error).toMatch(/Plafond/)
  })
})

describe("POST /api/admin/boutique/reverse", () => {
  it("400 sans saleId", async () => {
    expect((await REVERSE(req({}) as never)).status).toBe(400)
  })
  it("appelle comptoir_reverse", async () => {
    mocks.rpc.mockResolvedValue({ data: { sale_number: "CPT-2" }, error: null })
    const res = await REVERSE(req({ saleId: "s1" }) as never)
    expect(res.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("comptoir_reverse", { p_sale_id: "s1" })
  })
  it("mappe DEJA_ANNULEE", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "DEJA_ANNULEE" } })
    const body = await (await REVERSE(req({ saleId: "s1" }) as never)).json()
    expect(body.error).toMatch(/déjà annulée/i)
  })
})
