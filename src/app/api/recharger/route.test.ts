import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeSupabaseStub, type QueryContext, type StubClient } from "@/test/supabase-stub"

const mocks = vi.hoisted(() => ({ user: null as StubClient | null }))
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => mocks.user }))
vi.mock("@/lib/stripe", () => ({ getStripe: () => null }))   // mode simulé (pas de clé) → crédit direct
vi.mock("@/lib/origin", () => ({ resolveOrigin: () => "http://localhost" }))

import { POST } from "./route"

function setup(iban: string | null) {
  mocks.user = makeSupabaseStub({
    user: { id: "user-1" },
    resolve: (ctx: QueryContext) => {
      if (ctx.table === "accounts") return { data: { id: "acc-1", iban } }
      if (ctx.table === "wallet_recharge_config") return { data: { bonus_cents: 500 } }
      if (ctx.table === "wallets") return { data: { id: "w1", balance_cents: 0 } }
      return { data: null }
    },
  })
}
const call = async (amountCents: number) => {
  const res = await POST(new Request("http://localhost/api/recharger", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountCents }),
  }) as never)
  return { status: res.status, body: await res.json() }
}
beforeEach(() => { mocks.user = null })

describe("POST /api/recharger — garde IBAN (PS-09b §0)", () => {
  it("refuse la recharge en ligne sans IBAN", async () => {
    setup(null)
    const r = await call(5000)
    expect(r.status).toBe(400)
    expect(r.body.code).toBe("IBAN_REQUIS")
  })
  it("passe avec un IBAN renseigné", async () => {
    setup("FR7630006000011234567890189")
    const r = await call(5000)
    expect(r.status).toBe(200)
    expect(r.body.code).not.toBe("IBAN_REQUIS")
  })
})
