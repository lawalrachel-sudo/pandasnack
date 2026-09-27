import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeSupabaseStub, queriesOn, type QueryContext, type StubClient } from "@/test/supabase-stub"

const mocks = vi.hoisted(() => ({ user: null as StubClient | null, admin: null as StubClient | null }))
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => mocks.user }))
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => mocks.admin }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => ({ user: { id: "admin" } }) }))

import { POST as ARCHIVE } from "./route"
import { POST as UNARCHIVE } from "../unarchive/route"

const ID = "acc-1"
const params = Promise.resolve({ id: ID })

function setup(archiveResult: { data?: unknown; error?: unknown } = { data: [{ id: ID, archived_at: "now" }] }) {
  mocks.user = makeSupabaseStub({ user: { id: "admin" }, resolve: () => ({ data: null }) })
  mocks.admin = makeSupabaseStub({ user: null, resolve: (ctx: QueryContext) => (ctx.table === "accounts" ? archiveResult : { data: null }) })
}

beforeEach(() => { mocks.user = null; mocks.admin = null })

describe("POST archive / unarchive (PS-06f)", () => {
  it("archive pose archived_at, borné à archived_at is null (idempotent)", async () => {
    setup()
    const res = await ARCHIVE(new Request("http://x", { method: "POST" }), { params })
    expect(res.status).toBe(200)
    const upd = queriesOn(mocks.admin!, "accounts").find((q) => q.op === "update")!
    expect((upd.payload as { archived_at: string }).archived_at).toBeTruthy()
    expect(upd.eq.id).toBe(ID)
    expect(upd.calls.some((c) => c.method === "is" && c.args[0] === "archived_at" && c.args[1] === null)).toBe(true)
  })

  it("archive déjà archivé → succès idempotent (0 ligne)", async () => {
    setup({ data: [] })
    const res = await ARCHIVE(new Request("http://x", { method: "POST" }), { params })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.alreadyArchived).toBe(true)
  })

  it("unarchive remet archived_at à null", async () => {
    setup({ data: null })
    const res = await UNARCHIVE(new Request("http://x", { method: "POST" }), { params })
    expect(res.status).toBe(200)
    const upd = queriesOn(mocks.admin!, "accounts").find((q) => q.op === "update")!
    expect((upd.payload as { archived_at: null }).archived_at).toBeNull()
    expect(upd.eq.id).toBe(ID)
  })
})
