import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeSupabaseStub, queriesOn, type QueryContext, type StubClient } from "@/test/supabase-stub"

const mocks = vi.hoisted(() => ({ user: null as StubClient | null, admin: null as StubClient | null }))
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => mocks.user }))
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => mocks.admin }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => ({ user: { id: "admin" } }) }))

import { POST } from "./route"

const ACCOUNT = "acc-1"

function setup(opts: { dup?: unknown; wallet?: Record<string, unknown> | null; txError?: unknown } = {}) {
  mocks.user = makeSupabaseStub({ user: { id: "admin" }, resolve: () => ({ data: null }) })
  mocks.admin = makeSupabaseStub({
    user: null,
    resolve: (ctx: QueryContext) => {
      if (ctx.table === "wallet_transactions") {
        if (ctx.op === "insert") return { error: opts.txError ?? null, data: [{ id: "tx1" }] }
        // lookup idempotence
        return { data: opts.dup ?? null }
      }
      if (ctx.table === "wallets") {
        if (ctx.op === "update") return { data: null }
        if (ctx.op === "insert") return { data: { id: "w1", balance_cents: 0, total_credited_cents: 0 } }
        return { data: opts.wallet === undefined ? { id: "w1", balance_cents: 1000, total_credited_cents: 20000 } : opts.wallet }
      }
      return { data: null }
    },
  })
}

function call(body: unknown, key = "idem-123") {
  const req = new Request("http://x/api/admin/wallet/credit", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    body: JSON.stringify(body),
  })
  return POST(req as never).then(async (res) => ({ status: res.status, body: await res.json() }))
}

beforeEach(() => { mocks.user = null; mocks.admin = null })

describe("POST /api/admin/wallet/credit", () => {
  it("400 sans Idempotency-Key", async () => {
    setup()
    expect((await call({ accountId: ACCOUNT, amountCents: 5000, mode: "especes" }, "")).status).toBe(400)
  })

  it("400 montant invalide", async () => {
    setup()
    expect((await call({ accountId: ACCOUNT, amountCents: 0, mode: "especes" })).status).toBe(400)
  })

  it("400 mode invalide", async () => {
    setup()
    const r = await call({ accountId: ACCOUNT, amountCents: 5000, mode: "bitcoin" })
    expect(r.status).toBe(400)
  })

  it("crédite montant + bonus et incrémente total_credited", async () => {
    setup({ wallet: { id: "w1", balance_cents: 1000, total_credited_cents: 20000 } })
    const r = await call({ accountId: ACCOUNT, amountCents: 5000, bonusCents: 500, mode: "especes" })
    expect(r.status).toBe(200)
    expect(r.body.total_credit_cents).toBe(5500)
    expect(r.body.balance_after_cents).toBe(6500)
    const tx = queriesOn(mocks.admin!, "wallet_transactions").find((q) => q.op === "insert")!
    expect((tx.payload as { type: string; amount_cents: number; idempotency_key: string }).type).toBe("adjustment")
    expect((tx.payload as { amount_cents: number }).amount_cents).toBe(5500)
    expect((tx.payload as { idempotency_key: string }).idempotency_key).toBe("idem-123")
    expect((tx.payload as { description: string }).description).toContain("+ bonus 5,00 €")
    const wUpd = queriesOn(mocks.admin!, "wallets").find((q) => q.op === "update")!
    expect((wUpd.payload as { total_credited_cents: number }).total_credited_cents).toBe(25500)
    expect((wUpd.payload as { balance_cents: number }).balance_cents).toBe(6500)
  })

  it("idempotence : clé déjà vue → duplicate, pas de nouvelle transaction", async () => {
    setup({ dup: { id: "tx-old", balance_after_cents: 6500 } })
    const r = await call({ accountId: ACCOUNT, amountCents: 5000, bonusCents: 500, mode: "especes" })
    expect(r.status).toBe(200)
    expect(r.body.duplicate).toBe(true)
    expect(queriesOn(mocks.admin!, "wallet_transactions").some((q) => q.op === "insert")).toBe(false)
  })

  it("course : insert en conflit 23505 → duplicate, pas de double crédit", async () => {
    setup({ txError: { code: "23505" } })
    const r = await call({ accountId: ACCOUNT, amountCents: 5000, mode: "especes" })
    expect(r.status).toBe(200)
    expect(r.body.duplicate).toBe(true)
    // le wallet n'est pas mis à jour quand l'insert a échoué
    expect(queriesOn(mocks.admin!, "wallets").some((q) => q.op === "update")).toBe(false)
  })

  it("bonus décoché (0) : total = montant seul", async () => {
    setup({ wallet: { id: "w1", balance_cents: 0, total_credited_cents: 0 } })
    const r = await call({ accountId: ACCOUNT, amountCents: 5000, bonusCents: 0, mode: "especes" })
    expect(r.body.total_credit_cents).toBe(5000)
    const tx = queriesOn(mocks.admin!, "wallet_transactions").find((q) => q.op === "insert")!
    expect((tx.payload as { description: string }).description).not.toContain("bonus")
  })
})
