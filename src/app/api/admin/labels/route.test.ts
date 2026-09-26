import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeSupabaseStub, type QueryContext, type StubClient } from "@/test/supabase-stub"

const mocks = vi.hoisted(() => ({ user: null as StubClient | null, admin: null as StubClient | null }))
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => mocks.user }))
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => mocks.admin }))
vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: async () => ({ user: { id: "admin" } }),
  SOURCE_LABELS: { pandattitude: "Pandattitude" },
}))

import { GET } from "./route"

// Les 3 commandes réelles du samedi 26/09 (PS-20260925-0002/-0003/-0005), telles qu'en base.
// Toppings réels du 26/09 (id → nom).
const T = {
  carottes: "27308e3c-3381-4a32-874e-b40f43907e6b",
  laitue: "1daa5698-6bb8-4c1d-9bda-62ca4a10c85a",
  beurre: "13eba632-51af-48f8-909c-af2ba1eda07f",
  piment: "e45ed49d-7a75-449b-a5d5-759ae7cccc93",
}
const TOPPINGS_REF = [
  { id: T.carottes, name: "Carottes râpées" },
  { id: T.laitue, name: "Laitue" },
  { id: T.beurre, name: "Beurre" },
  { id: T.piment, name: "Sauce piment" },
]

function order(p: {
  n: string; status: string; payment_method: string; is_test?: boolean; prenom: string; classe: string; plat: string; sku: string; toppingIds?: string[]
}) {
  const ids = p.toppingIds ?? []
  return {
    id: p.n, order_number: p.n, status: p.status, payment_method: p.payment_method,
    service_slots: { service_date: "2026-09-26", target_source_group: "pandattitude" },
    accounts: { source_group: "pandattitude", nom_compte: "Parent", is_test: p.is_test ?? false },
    order_items: [{
      id: p.n + "-i", profil_id: "pr", prenom_libre: null,
      formula_choices: { plat_sku: p.sku, toppings: ids }, topping_ids: ids, takeaway: false,
      notes: `Menu Panda — ${p.plat}`,
      menu_formulas: { name: "Menu Panda", dlc_hours: 24 },
      catalog_items: { name: p.plat, sku: p.sku, allergens: ["gluten"], dlc_hours: 24 },
      profils: { prenom: p.prenom, classe: p.classe },
    }],
  }
}

const REAL_26_09 = [
  order({ n: "PS-20260925-0002", status: "pending_payment", payment_method: "on_site", prenom: "Elyas", classe: "Pandattitude", plat: "Pasta Box Bolognaise (bœuf)", sku: "PASTA-BOLO", toppingIds: [T.piment] }),
  order({ n: "PS-20260925-0003", status: "paid", payment_method: "wallet_card", prenom: "Sofia", classe: "Mer 3D + Sam Dessin", plat: "Thon Mayo", sku: "SAND-B", toppingIds: [T.carottes, T.laitue, T.beurre, T.piment] }),
  order({ n: "PS-20260925-0005", status: "paid", payment_method: "wallet_card", prenom: "Leïa", classe: "Sam 3D", plat: "Thon Mayo", sku: "SAND-B", toppingIds: [T.carottes] }),
]

function setup(orders: unknown[]) {
  mocks.user = makeSupabaseStub({ user: { id: "admin" }, resolve: () => ({ data: null }) })
  mocks.admin = makeSupabaseStub({
    user: null,
    resolve: (ctx: QueryContext) => {
      if (ctx.table === "orders") return { data: orders }
      if (ctx.table === "toppings") return { data: TOPPINGS_REF }
      return { data: null }
    },
  })
}
function req(url: string) { return { nextUrl: new URL(url) } as never }
const call = (date = "2026-09-26") =>
  GET(req(`http://x/api/admin/labels?service_date=${date}`)).then(async (r) => ({ status: r.status, body: await r.json() }))

beforeEach(() => { mocks.user = null; mocks.admin = null })

describe("GET /api/admin/labels (PS-06c)", () => {
  it("les 3 commandes du 26/09 → 3 étiquettes (dont Sofia, classe combinée « + »)", async () => {
    setup(REAL_26_09)
    const r = await call()
    expect(r.status).toBe(200)
    expect(r.body.labels).toHaveLength(3)
    const nums = r.body.labels.map((l: { order_number: string }) => l.order_number)
    expect(nums).toContain("PS-20260925-0003") // Sofia, celle qui manquait
    const sofia = r.body.labels.find((l: { order_number: string }) => l.order_number === "PS-20260925-0003")
    expect(sofia.profil_prenom).toBe("Sofia")
    expect(sofia.profil_classe).toBe("Mer 3D + Sam Dessin") // la classe combinée n'écarte plus l'étiquette
  })

  it("imprime plat + options (piment + garnitures) sur chaque étiquette", async () => {
    setup(REAL_26_09)
    const r = await call()
    const byNum = Object.fromEntries(
      r.body.labels.map((l: { order_number: string; items: { name: string }[] }) => [l.order_number, l.items[0].name])
    )
    expect(byNum["PS-20260925-0002"]).toBe("Menu Panda — Pasta Box Bolognaise (bœuf) · 🌶 piment")
    expect(byNum["PS-20260925-0003"]).toBe("Menu Panda — Thon Mayo · 🌶 piment, Carottes râpées, Laitue, Beurre")
    expect(byNum["PS-20260925-0005"]).toBe("Menu Panda — Thon Mayo · Carottes râpées")
  })

  it("filtre = à préparer : exclut annulées et comptes test, garde on_site pending", async () => {
    setup([
      ...REAL_26_09,
      order({ n: "PS-CXL", status: "cancelled", payment_method: "wallet_card", prenom: "X", classe: "Sam 3D", plat: "Thon Mayo", sku: "SAND-B" }),
      order({ n: "PS-DRAFT", status: "pending_payment", payment_method: "draft", prenom: "Y", classe: "Sam 3D", plat: "Thon Mayo", sku: "SAND-B" }),
      order({ n: "PS-TEST", status: "paid", payment_method: "wallet_card", is_test: true, prenom: "Z", classe: "Sam 3D", plat: "Thon Mayo", sku: "SAND-B" }),
    ])
    const r = await call()
    const nums = r.body.labels.map((l: { order_number: string }) => l.order_number).sort()
    expect(nums).toEqual(["PS-20260925-0002", "PS-20260925-0003", "PS-20260925-0005"])
  })

  it("400 sans service_date", async () => {
    setup([])
    const r = await GET(req("http://x/api/admin/labels"))
    expect(r.status).toBe(400)
  })
})
