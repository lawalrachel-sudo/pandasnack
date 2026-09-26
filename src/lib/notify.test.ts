import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeSupabaseStub, queriesOn, type QueryContext, type StubClient } from "@/test/supabase-stub"

const mocks = vi.hoisted(() => ({ admin: null as StubClient | null }))
vi.mock("@supabase/supabase-js", () => ({ createClient: () => mocks.admin }))
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co")
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc")

import { notifyNewOrder } from "./notify"

const ORDER = {
  id: "o1", order_number: "PS-1", total_cents: 1000, payment_method: "on_site", paid_at: null,
  service_slots: { service_date: "2026-09-26" },
  accounts: { nom_compte: "Parent" },
  order_items: [{ quantity: 1, notes: "Menu Panda — Thon\nSAUCE PIMENT", menu_formulas: { name: "Menu Panda" }, catalog_items: null, profils: { prenom: "Sofia" } }],
}

function setup(opts: { claimRows?: unknown[] } = {}) {
  mocks.admin = makeSupabaseStub({
    user: null,
    resolve: (ctx: QueryContext) => {
      if (ctx.table === "orders") {
        if (ctx.op === "update") return { data: opts.claimRows ?? [{ id: "o1" }] }  // claim notified_at
        return { data: ORDER }  // select single
      }
      return { data: null }
    },
  })
}

const fetchMock = vi.fn()
beforeEach(() => { mocks.admin = null; fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock) })
afterEach(() => { vi.unstubAllEnvs?.(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc") })

describe("notifyNewOrder", () => {
  it("sans RESEND_API_KEY : ne consomme pas notified_at et n'envoie rien", async () => {
    vi.stubEnv("RESEND_API_KEY", "")
    setup()
    const r = await notifyNewOrder("o1")
    expect(r).toEqual({ sent: false, reason: "no_api_key" })
    expect(queriesOn(mocks.admin!, "orders").some((q) => q.op === "update")).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("envoie un e-mail Resend une fois, après avoir réservé notified_at", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    setup()
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "" })
    const r = await notifyNewOrder("o1")
    expect(r.sent).toBe(true)
    // claim notified_at conditionné à is(null)
    const claim = queriesOn(mocks.admin!, "orders").find((q) => q.op === "update")!
    expect(claim.calls.some((c) => c.method === "is" && c.args[0] === "notified_at")).toBe(true)
    // appel Resend avec le bon endpoint et un sujet contenant l'enfant
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.resend.com/emails")
    const payload = JSON.parse((init as { body: string }).body)
    expect(payload.subject).toContain("Sofia")
    expect(payload.subject).toContain("PS-1")
    expect(payload.to).toEqual(["secretariat@pandattitude.com"])
    // l'option piment remonte dans le corps
    expect(payload.text).toMatch(/piment/i)
  })

  it("déjà notifiée (0 ligne réservée) : n'envoie pas", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    setup({ claimRows: [] })
    const r = await notifyNewOrder("o1")
    expect(r).toEqual({ sent: false, reason: "already_notified" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("échec Resend : non bloquant, retourne sent=false", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    setup()
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => "bad" })
    const r = await notifyNewOrder("o1")
    expect(r.sent).toBe(false)
    expect(r.reason).toContain("resend_422")
  })

  it("exception interne : jamais propagée", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    setup()
    fetchMock.mockRejectedValue(new Error("network down"))
    const r = await notifyNewOrder("o1")
    expect(r.sent).toBe(false)
    expect(r.reason).toBe("exception")
  })
})
