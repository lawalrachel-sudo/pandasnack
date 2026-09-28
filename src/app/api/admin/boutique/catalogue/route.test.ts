import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeSupabaseStub, queriesOn, type QueryContext, type StubClient } from "@/test/supabase-stub"

const mocks = vi.hoisted(() => ({ user: null as StubClient | null, admin: null as StubClient | null }))
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => mocks.user }))
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => mocks.admin }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => ({ user: { id: "admin" } }) }))

import { PATCH } from "./route"

function setup() {
  mocks.user = makeSupabaseStub({ user: { id: "admin" }, resolve: () => ({ data: null }) })
  mocks.admin = makeSupabaseStub({
    user: null,
    resolve: (ctx: QueryContext) => {
      // La mise à jour principale (avec .select) renvoie l'article ; le « clear others » non.
      if (ctx.table === "catalog_items" && ctx.calls.some((c) => c.method === "select")) {
        return { data: { id: "B", name: "Cookie", is_hero: true } }
      }
      return { data: null }
    },
  })
}
const patch = async (body: unknown) => {
  const res = (await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) as never)) as Response
  return { status: res.status, body: await res.json() }
}

beforeEach(() => { mocks.user = null; mocks.admin = null })

describe("PATCH catalogue — produit à l'honneur unique (PS-08b)", () => {
  it("activer le hero sur B désactive les autres (is_hero=false where is_hero=true, id<>B)", async () => {
    setup()
    const r = await patch({ id: "B", is_hero: true })
    expect(r.status).toBe(200)
    const updates = queriesOn(mocks.admin!, "catalog_items").filter((q) => q.op === "update")
    const clear = updates.find((q) => (q.payload as { is_hero?: boolean }).is_hero === false)
    expect(clear).toBeTruthy()
    expect(clear!.eq.is_hero).toBe(true)
    expect(clear!.calls.some((c) => c.method === "neq" && c.args[0] === "id" && c.args[1] === "B")).toBe(true)
  })
  it("refuse un hero_text > 120 caractères", async () => {
    setup()
    const r = await patch({ id: "B", hero_text: "x".repeat(121) })
    expect(r.status).toBe(400)
  })
})
