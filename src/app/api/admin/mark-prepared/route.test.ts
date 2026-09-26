import { beforeEach, describe, expect, it, vi } from "vitest"
import { jsonRequest, makeSupabaseStub, queriesOn, type QueryContext, type StubClient } from "@/test/supabase-stub"

const mocks = vi.hoisted(() => ({ user: null as StubClient | null, admin: null as StubClient | null }))
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => mocks.user }))
vi.mock("@supabase/supabase-js", () => ({ createClient: () => mocks.admin }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => ({ user: { id: "admin" } }) }))
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co")
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc")

import { POST } from "./route"

const ORDER = "ord-1"

function setup(result: { data?: unknown; error?: unknown }) {
  mocks.user = makeSupabaseStub({ user: { id: "admin" }, resolve: () => ({ data: null }) })
  mocks.admin = makeSupabaseStub({ user: null, resolve: (ctx: QueryContext) => (ctx.table === "orders" ? result : { data: null }) })
}
const call = async (body: unknown) => {
  const res = await POST(jsonRequest(body) as never)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => { mocks.user = null; mocks.admin = null })

describe("POST /api/admin/mark-prepared", () => {
  it("400 si prepared n'est pas booléen", async () => {
    setup({ data: [{ id: ORDER }] })
    expect((await call({ orderId: ORDER })).status).toBe(400)
  })

  it("marque préparé (prepared_at = date)", async () => {
    setup({ data: [{ id: ORDER, prepared_at: "2026-09-25T09:00:00Z", status: "paid" }] })
    const r = await call({ orderId: ORDER, prepared: true })
    expect(r.status).toBe(200)
    const upd = queriesOn(mocks.admin!, "orders").find((q) => q.op === "update")!
    expect((upd.payload as { prepared_at: string | null }).prepared_at).toBeTruthy()
    // jamais sur une commande annulée
    expect(upd.calls.some((c) => c.method === "neq" && c.args[0] === "status" && c.args[1] === "cancelled")).toBe(true)
  })

  it("dé-marque (prepared_at = null)", async () => {
    setup({ data: [{ id: ORDER, prepared_at: null, status: "paid" }] })
    await call({ orderId: ORDER, prepared: false })
    const upd = queriesOn(mocks.admin!, "orders").find((q) => q.op === "update")!
    expect((upd.payload as { prepared_at: string | null }).prepared_at).toBeNull()
  })

  it("404 si commande introuvable ou annulée", async () => {
    setup({ data: [] })
    expect((await call({ orderId: ORDER, prepared: true })).status).toBe(404)
  })
})
