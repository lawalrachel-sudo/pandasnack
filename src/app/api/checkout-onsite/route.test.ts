import { beforeEach, describe, expect, it, vi } from "vitest"
import { jsonRequest, makeSupabaseStub, type QueryContext, type StubClient } from "@/test/supabase-stub"

const mocks = vi.hoisted(() => ({ user: null as StubClient | null, notify: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => mocks.user }))
vi.mock("@/lib/notify", () => ({ notifyNewOrder: (id: string) => mocks.notify(id) }))

import { POST } from "./route"

const ACCOUNT = "acc-1"
const USER = { id: "user-1", email: "p@x.fr" }

// `before` = état payment_method avant confirmation ; `updated` = lignes confirmées.
function setup(before: Array<{ id: string; payment_method: string | null }>, updated: Array<{ id: string }>) {
  mocks.user = makeSupabaseStub({
    user: USER,
    resolve: (ctx: QueryContext) => {
      if (ctx.table === "accounts") return { data: { id: ACCOUNT, source_group: "pandattitude" } }
      if (ctx.table === "orders") {
        if (ctx.op === "update") return { data: updated }
        return { data: before } // le select "before"
      }
      return { data: null }
    },
  })
}
const call = (orderIds: string[]) => POST(jsonRequest({ orderIds }) as never).then(async (r) => ({ status: r.status, body: await r.json() }))

beforeEach(() => { mocks.user = null; mocks.notify.mockReset() })

describe("POST /api/checkout-onsite (PS-06d)", () => {
  it("notifie une commande fraîchement transitionnée vers on_site", async () => {
    setup([{ id: "o1", payment_method: "draft" }], [{ id: "o1" }])
    const r = await call(["o1"])
    expect(r.status).toBe(200)
    expect(mocks.notify).toHaveBeenCalledTimes(1)
    expect(mocks.notify).toHaveBeenCalledWith("o1")
  })

  it("ne re-notifie PAS une commande déjà on_site (re-confirmation)", async () => {
    setup([{ id: "o1", payment_method: "on_site" }], [{ id: "o1" }])
    const r = await call(["o1"])
    expect(r.status).toBe(200) // la confirmation réussit (idempotente)
    expect(mocks.notify).not.toHaveBeenCalled()
  })

  it("sur un lot mixte, ne notifie que les nouvelles", async () => {
    setup(
      [{ id: "o1", payment_method: "draft" }, { id: "o2", payment_method: "on_site" }],
      [{ id: "o1" }, { id: "o2" }]
    )
    await call(["o1", "o2"])
    expect(mocks.notify).toHaveBeenCalledTimes(1)
    expect(mocks.notify).toHaveBeenCalledWith("o1")
  })
})
