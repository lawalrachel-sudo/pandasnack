import { beforeEach, describe, expect, it, vi } from "vitest"
import { jsonRequest, makeSupabaseStub, queriesOn, type QueryContext, type StubClient } from "@/test/supabase-stub"

// Mocks des deux clients Supabase utilisés par la route.
const mocks = vi.hoisted(() => ({
  user: null as StubClient | null,
  admin: null as StubClient | null,
}))

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => mocks.user,
}))
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mocks.admin,
}))

import { POST } from "./route"

const ACCOUNT = "acc-1"
const ORDER = "ord-1"
const USER = { id: "user-1", email: "parent@exemple.fr" }

// Cutoff largement dans le futur / dans le passé, indépendamment de la date du test.
const FUTUR = new Date(Date.now() + 86_400_000).toISOString()
const PASSE = new Date(Date.now() - 86_400_000).toISOString()

interface Scenario {
  user?: typeof USER | null
  order?: Record<string, unknown> | null
  cutoff?: string | null
  updateResult?: { data?: unknown; error?: unknown }
  wallet?: Record<string, unknown> | null
  walletTxError?: unknown
}

function setup(s: Scenario = {}) {
  const order = s.order === undefined
    ? { id: ORDER, account_id: ACCOUNT, status: "paid", total_cents: 1500, payment_method: "on_site", wallet_transaction_id: null, service_slot_id: "slot-1" }
    : s.order

  mocks.user = makeSupabaseStub({
    user: s.user === undefined ? USER : s.user,
    resolve: (ctx: QueryContext) => {
      if (ctx.table === "accounts") return { data: { id: ACCOUNT } }
      if (ctx.table === "orders") return { data: order }
      if (ctx.table === "service_slots") return { data: { orders_cutoff_at: s.cutoff === undefined ? FUTUR : s.cutoff } }
      return { data: null }
    },
  })

  mocks.admin = makeSupabaseStub({
    user: null,
    resolve: (ctx: QueryContext) => {
      if (ctx.table === "orders") {
        return s.updateResult ?? { data: [{ id: ORDER, status: "cancelled", cancelled_at: "now" }] }
      }
      if (ctx.table === "wallets") {
        if (ctx.op === "update") return { data: null }
        return { data: s.wallet === undefined ? { id: "w1", balance_cents: 0, total_credited_cents: 0 } : s.wallet }
      }
      if (ctx.table === "wallet_transactions") return { data: null, error: s.walletTxError ?? null }
      return { data: null }
    },
  })
}

async function call(body: unknown = { orderId: ORDER }) {
  const res = await POST(jsonRequest(body) as never)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => { mocks.user = null; mocks.admin = null })

describe("POST /api/cancel-order", () => {
  it("401 si non authentifié", async () => {
    setup({ user: null })
    expect((await call()).status).toBe(401)
  })

  it("400 si orderId manquant", async () => {
    setup()
    const r = await call({})
    expect(r.status).toBe(400)
  })

  it("404 si la commande n'appartient pas au compte", async () => {
    setup({ order: null })
    expect((await call()).status).toBe(404)
  })

  it("400 si la commande est déjà annulée", async () => {
    setup({ order: { id: ORDER, account_id: ACCOUNT, status: "cancelled", total_cents: 0, payment_method: "on_site", service_slot_id: null } })
    expect((await call()).status).toBe(400)
  })

  it("400 si la commande payée est passée après le cutoff", async () => {
    setup({ cutoff: PASSE })
    const r = await call()
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/heure limite/i)
  })

  it("autorise l'annulation d'une commande pending_payment même après le cutoff", async () => {
    setup({
      order: { id: ORDER, account_id: ACCOUNT, status: "pending_payment", total_cents: 1500, payment_method: "draft", service_slot_id: "slot-1" },
      cutoff: PASSE,
    })
    expect((await call()).status).toBe(200)
  })

  // ---- Régression PS-05 §A-10 : la route répondait success sans rien écrire ----

  it("renvoie 500 (et PAS success) quand l'UPDATE échoue", async () => {
    setup({ updateResult: { error: { message: "new row violates row-level security policy" } } })
    const r = await call()
    expect(r.status).toBe(500)
    expect(r.body.success).toBeUndefined()
  })

  it("renvoie 409 (et PAS success) quand l'UPDATE ne touche aucune ligne", async () => {
    setup({ updateResult: { data: [] } })
    const r = await call()
    expect(r.status).toBe(409)
    expect(r.body.success).toBeUndefined()
  })

  it("écrit bien status=cancelled ET cancelled_at", async () => {
    setup()
    await call()
    const upd = queriesOn(mocks.admin!, "orders").find((q) => q.op === "update")
    expect(upd).toBeDefined()
    const payload = upd!.payload as { status: string; cancelled_at: string }
    expect(payload.status).toBe("cancelled")
    expect(payload.cancelled_at).toBeTruthy()
    expect(Number.isNaN(Date.parse(payload.cancelled_at))).toBe(false)
  })

  it("borne l'UPDATE service_role au compte propriétaire et aux statuts annulables", async () => {
    setup()
    await call()
    const upd = queriesOn(mocks.admin!, "orders").find((q) => q.op === "update")!
    expect(upd.eq.id).toBe(ORDER)
    expect(upd.eq.account_id).toBe(ACCOUNT)
    expect(upd.in.status).toEqual(["paid", "pending_payment"])
  })

  // ---- Wallet ----

  it("ne recrédite pas le wallet pour un paiement sur place", async () => {
    setup()
    const r = await call()
    expect(r.status).toBe(200)
    expect(r.body.refunded).toBe(false)
    expect(queriesOn(mocks.admin!, "wallet_transactions")).toHaveLength(0)
  })

  it("recrédite le wallet pour une commande payée par carte", async () => {
    setup({ order: { id: ORDER, account_id: ACCOUNT, status: "paid", total_cents: 1500, payment_method: "wallet_card", service_slot_id: "slot-1" } })
    const r = await call()
    expect(r.status).toBe(200)
    expect(r.body.refunded).toBe(true)
    const tx = queriesOn(mocks.admin!, "wallet_transactions").find((q) => q.op === "insert")!
    expect((tx.payload as { amount_cents: number }).amount_cents).toBe(1500)
    expect((tx.payload as { balance_after_cents: number }).balance_after_cents).toBe(1500)
  })

  it("signale l'échec du recrédit sans prétendre qu'il a eu lieu", async () => {
    setup({
      order: { id: ORDER, account_id: ACCOUNT, status: "paid", total_cents: 1500, payment_method: "wallet_card", service_slot_id: "slot-1" },
      walletTxError: { message: "boom" },
    })
    const r = await call()
    expect(r.status).toBe(200)
    expect(r.body.refunded).toBe(false)
    expect(r.body.warning).toMatch(/recrédit/i)
  })
})
