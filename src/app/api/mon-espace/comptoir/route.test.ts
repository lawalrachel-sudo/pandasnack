import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeSupabaseStub, queriesOn, type QueryContext, type StubClient } from "@/test/supabase-stub"

const mocks = vi.hoisted(() => ({ user: null as StubClient | null, admin: null as StubClient | null }))
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => mocks.user }))
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => mocks.admin }))

import { GET } from "./route"

const ACCOUNT = "acc-1"
const SALES = [
  { id: "s1", sale_number: "CPT-1", service_date: "2026-09-28", created_at: "2026-09-28T10:00:00Z", prenom: "Loulou", items: [{ name: "Gaufre", qty: 1 }], payment_mode: "wallet", jeton_qty: null, total_cents: 150, reverses_sale_id: null },
  { id: "s2", sale_number: "CPT-2", service_date: "2026-09-28", created_at: "2026-09-28T11:00:00Z", prenom: "Loulou", items: [{ name: "Bubble Tea", qty: 1 }], payment_mode: "especes", jeton_qty: null, total_cents: 400, reverses_sale_id: null },
  { id: "r1", sale_number: "CPT-3", service_date: "2026-09-28", created_at: "2026-09-28T11:05:00Z", prenom: "Loulou", items: [], payment_mode: "especes", jeton_qty: null, total_cents: -400, reverses_sale_id: "s2" },
]

function setup(user: { id: string } | null) {
  mocks.user = makeSupabaseStub({
    user: user ?? undefined,
    resolve: (ctx: QueryContext) => {
      if (!user) return { data: null }
      if (ctx.table === "accounts") return { data: { id: ACCOUNT } }
      return { data: null }
    },
  })
  mocks.admin = makeSupabaseStub({
    user: null,
    resolve: (ctx: QueryContext) => (ctx.table === "comptoir_sales" ? { data: SALES } : { data: null }),
  })
}
const get = async () => {
  const res = await GET()
  return { status: res.status, body: await res.json() }
}

beforeEach(() => { mocks.user = null; mocks.admin = null })

describe("GET /api/mon-espace/comptoir (PS-08b)", () => {
  it("401 si non authentifié", async () => {
    setup(null)
    expect((await get()).status).toBe(401)
  })
  it("filtre strictement sur le compte connecté", async () => {
    setup({ id: "user-1" })
    await get()
    const q = queriesOn(mocks.admin!, "comptoir_sales")[0]
    expect(q.eq.account_id).toBe(ACCOUNT)
  })
  it("exclut les lignes de contre-écriture et marque la vente annulée", async () => {
    setup({ id: "user-1" })
    const r = await get()
    expect(r.status).toBe(200)
    const ids = r.body.sales.map((s: { id: string }) => s.id)
    expect(ids).toEqual(["s1", "s2"])              // la ligne r1 (reversal) n'apparaît pas
    const s2 = r.body.sales.find((s: { id: string }) => s.id === "s2")
    expect(s2.annulee).toBe(true)                  // s2 est annulée par r1
    expect(r.body.sales.find((s: { id: string }) => s.id === "s1").annulee).toBe(false)
  })
})
