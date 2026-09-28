import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeSupabaseStub, queriesOn, type QueryContext, type StubClient } from "@/test/supabase-stub"

const mocks = vi.hoisted(() => ({ user: null as StubClient | null }))
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => mocks.user }))

import { PATCH } from "./route"

function setup(user: { id: string; email?: string } | null) {
  mocks.user = makeSupabaseStub({
    user: user ?? undefined,
    resolve: (ctx: QueryContext) => (ctx.table === "accounts" ? { data: { id: "acc-1" } } : { data: null }),
  })
}
const patch = async (body: unknown) => {
  const res = (await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) as never)) as Response
  return { status: res.status, body: await res.json() }
}
beforeEach(() => { mocks.user = null })

describe("PATCH /api/account — IBAN (PS-09a)", () => {
  it("401 si non authentifié", async () => {
    setup(null)
    expect((await patch({ iban: "FR7630006000011234567890189" })).status).toBe(401)
  })
  it("accepte un IBAN valide (normalisé, sans espaces)", async () => {
    setup({ id: "user-1" })
    const r = await patch({ iban: "FR76 3000 6000 0112 3456 7890 189", iban_titulaire: "Rachel L" })
    expect(r.status).toBe(200)
    const upd = queriesOn(mocks.user!, "accounts").find((q) => q.op === "update")!
    expect((upd.payload as { iban: string }).iban).toBe("FR7630006000011234567890189")
    expect((upd.payload as { iban_titulaire: string }).iban_titulaire).toBe("Rachel L")
    expect(upd.eq.auth_user_id).toBe("user-1")   // propriétaire uniquement
  })
  it("refuse un IBAN invalide", async () => {
    setup({ id: "user-1" })
    const r = await patch({ iban: "FR7630006000011234567890188", iban_titulaire: "X" })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/IBAN invalide/)
  })
})
