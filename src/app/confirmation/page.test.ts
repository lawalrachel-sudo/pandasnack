import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeSupabaseStub, queriesOn, type QueryContext, type StubClient } from "@/test/supabase-stub"

const mocks = vi.hoisted(() => ({ user: null as StubClient | null }))

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => mocks.user,
}))

// redirect() de Next interrompt le rendu en lançant : on reproduit ce contrat.
class RedirectError extends Error {
  constructor(public to: string) { super(`REDIRECT:${to}`) }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new RedirectError(to) },
}))

// Le composant client n'est pas rendu ici : on teste la couche données du server component.
vi.mock("./ConfirmationClient", () => ({ ConfirmationClient: () => null }))

import ConfirmationPage from "./page"

const ACCOUNT = "acc-1"
const ORDER = "ord-1"
const USER = { id: "user-1", email: "parent@exemple.fr" }

function setup(opts: { order?: Record<string, unknown> | null; account?: { id: string } | null } = {}) {
  mocks.user = makeSupabaseStub({
    user: USER,
    resolve: (ctx: QueryContext) => {
      if (ctx.table === "accounts") return { data: opts.account === undefined ? { id: ACCOUNT } : opts.account }
      if (ctx.table === "orders") {
        if (ctx.op === "update") throw new Error("La page /confirmation ne doit jamais écrire.")
        return { data: opts.order === undefined ? { id: ORDER, account_id: ACCOUNT, order_number: "PS-1", status: "paid", total_cents: 1500, service_slots: { service_date: "2026-09-26" } } : opts.order }
      }
      if (ctx.table === "order_items") return { data: [] }
      return { data: null }
    },
  })
}

async function render(params: Record<string, string>) {
  try {
    await ConfirmationPage({ searchParams: Promise.resolve(params) } as never)
    return { redirected: null as string | null }
  } catch (e) {
    if (e instanceof RedirectError) return { redirected: e.to }
    throw e
  }
}

beforeEach(() => { mocks.user = null })

describe("page /confirmation", () => {
  it("redirige vers /commander sans paramètre order", async () => {
    setup()
    expect((await render({})).redirected).toBe("/commander")
  })

  it("redirige vers /onboarding si le compte n'existe pas encore", async () => {
    setup({ account: null })
    expect((await render({ order: ORDER })).redirected).toBe("/onboarding")
  })

  it("redirige vers /commander quand la commande n'est pas celle du compte", async () => {
    setup({ order: null })
    expect((await render({ order: "ord-d-un-autre" })).redirected).toBe("/commander")
  })

  it("borne la lecture de la commande au compte connecté", async () => {
    setup()
    await render({ order: ORDER })
    const q = queriesOn(mocks.user!, "orders").find((c) => c.eq.id === ORDER)!
    expect(q.eq.account_id).toBe(ACCOUNT)
  })

  // ---- Régression PS-05 : la page marquait `paid` sur simple ?session_id= ----

  it("n'écrit RIEN même avec un session_id dans l'URL", async () => {
    setup()
    await render({ order: ORDER, session_id: "cs_live_peu_importe" })
    const writes = mocks.user!.queries.filter((q) => q.op === "update" || q.op === "insert" || q.op === "delete")
    expect(writes).toEqual([])
  })

  it("le code source ne contient plus aucune écriture", () => {
    const src = readFileSync(join(process.cwd(), "src/app/confirmation/page.tsx"), "utf8")
    expect(src).not.toMatch(/\.update\(/)
    expect(src).not.toMatch(/\.insert\(/)
    expect(src).not.toMatch(/status:\s*["']paid["']/)
  })
})
