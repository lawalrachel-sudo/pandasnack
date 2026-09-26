import { beforeEach, describe, expect, it, vi } from "vitest"
import { jsonRequest, makeSupabaseStub, queriesOn, type QueryContext, type StubClient } from "@/test/supabase-stub"

// mark-paid et mark-prepared construisent leur client service_role via @supabase/supabase-js.
const mocks = vi.hoisted(() => ({ user: null as StubClient | null, admin: null as StubClient | null }))
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => mocks.user }))
vi.mock("@supabase/supabase-js", () => ({ createClient: () => mocks.admin }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => ({ user: { id: "admin" } }) }))
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co")
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc")

import { POST } from "./route"

const ORDER = "ord-1"

function setup(updateResult: { data?: unknown; error?: unknown }) {
  mocks.user = makeSupabaseStub({ user: { id: "admin" }, resolve: () => ({ data: null }) })
  mocks.admin = makeSupabaseStub({ user: null, resolve: (ctx: QueryContext) => (ctx.table === "orders" ? updateResult : { data: null }) })
}
const call = async (body: unknown) => {
  const res = await POST(jsonRequest(body) as never)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => { mocks.user = null; mocks.admin = null })

describe("POST /api/admin/mark-paid", () => {
  it("400 sans orderId", async () => {
    setup({ data: [{ id: ORDER }] })
    expect((await call({})).status).toBe(400)
  })

  it("400 sur un mode invalide", async () => {
    setup({ data: [{ id: ORDER }] })
    const r = await call({ orderId: ORDER, mode: "bitcoin" })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/mode invalide/)
  })

  it("encaisse et stocke le mode espèces", async () => {
    setup({ data: [{ id: ORDER, paid_at: "now", status: "paid", payment_mode: "especes" }] })
    const r = await call({ orderId: ORDER, mode: "especes" })
    expect(r.status).toBe(200)
    const upd = queriesOn(mocks.admin!, "orders").find((q) => q.op === "update")!
    expect((upd.payload as { status: string; payment_mode: string }).status).toBe("paid")
    expect((upd.payload as { payment_mode: string }).payment_mode).toBe("especes")
    // ne touche que les on_site non déjà encaissées et non annulées
    expect(upd.eq.payment_method).toBe("on_site")
    expect(upd.calls.some((c) => c.method === "neq" && c.args[0] === "status" && c.args[1] === "cancelled")).toBe(true)
  })

  it("accepte l'absence de mode (compat)", async () => {
    setup({ data: [{ id: ORDER, status: "paid" }] })
    const r = await call({ orderId: ORDER })
    expect(r.status).toBe(200)
    const upd = queriesOn(mocks.admin!, "orders").find((q) => q.op === "update")!
    expect("payment_mode" in (upd.payload as object)).toBe(false)
  })

  it("404 si rien encaissé (déjà payé / pas on_site)", async () => {
    setup({ data: [] })
    expect((await call({ orderId: ORDER, mode: "especes" })).status).toBe(404)
  })
})
