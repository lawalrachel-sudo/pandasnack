import { beforeEach, describe, expect, it, vi } from "vitest"
import { jsonRequest, makeSupabaseStub, queriesOn, type QueryContext, type StubClient } from "@/test/supabase-stub"

const mocks = vi.hoisted(() => ({
  user: null as StubClient | null,
  admin: null as StubClient | null,
}))

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => mocks.user }))
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => mocks.admin }))

import { GET, POST } from "./route"

const ACCOUNT = "acc-1"
const EMAIL = "laurie.germon@gmail.com"
const USER = { id: "user-1", email: EMAIL }

const SAMUEL = { id: "e1", annee: "2026-27", prenom: "Samuel", nom: "Germon", classe: "mercredi", email_parent: EMAIL, email_parent2: null }
const THOMAS = { id: "e2", annee: "2026-27", prenom: "Thomas", nom: "Germon", classe: "samedi", email_parent: EMAIL, email_parent2: null }
const AUTRE = { id: "e3", annee: "2026-27", prenom: "Lina", nom: "X", classe: "mercredi", email_parent: "autre@parent.fr", email_parent2: null }
const VIEUX = { id: "e4", annee: "2025-26", prenom: "Enzo", nom: "Germon", classe: "samedi", email_parent: EMAIL, email_parent2: null }

interface Scenario {
  user?: typeof USER | null
  account?: { id: string; source_group: string } | null
  eleves?: Array<Record<string, unknown>>
  profils?: Array<{ prenom: string | null }>
  defautsExistants?: number
  insertResult?: { data?: unknown; error?: unknown }
  admin?: boolean
}

function setup(s: Scenario = {}) {
  mocks.user = makeSupabaseStub({
    user: s.user === undefined ? USER : s.user,
    resolve: (ctx: QueryContext) => {
      if (ctx.table === "accounts") {
        return { data: s.account === undefined ? { id: ACCOUNT, source_group: "pandattitude" } : s.account }
      }
      return { data: null }
    },
  })

  mocks.admin = s.admin === false ? null : makeSupabaseStub({
    user: null,
    resolve: (ctx: QueryContext) => {
      if (ctx.table === "eleves_connus") return { data: s.eleves ?? [SAMUEL, THOMAS] }
      if (ctx.table === "profils") {
        if (ctx.op === "insert") {
          const rows = ctx.payload as Array<Record<string, unknown>>
          return s.insertResult ?? { data: rows.map((r, i) => ({ id: `p${i}`, ...r })) }
        }
        if (ctx.calls.some((c) => c.method === "eq" && c.args[0] === "is_default")) {
          return { count: s.defautsExistants ?? 1, data: null }
        }
        return { data: s.profils ?? [] }
      }
      return { data: null }
    },
  })
}

beforeEach(() => { mocks.user = null; mocks.admin = null })

describe("GET /api/eleves-connus", () => {
  it("401 si non authentifié", async () => {
    setup({ user: null })
    expect((await GET()).status).toBe(401)
  })

  it("404 si le compte n'existe pas", async () => {
    setup({ account: null })
    expect((await GET()).status).toBe(404)
  })

  it("500 si la clé service_role manque", async () => {
    setup({ admin: false })
    expect((await GET()).status).toBe(500)
  })

  it("propose les enfants rattachés à l'e-mail de la session", async () => {
    setup()
    const body = await (await GET()).json()
    expect(body.eleves.map((e: { prenom: string }) => e.prenom)).toEqual(["Samuel", "Thomas"])
    expect(body.annee).toBe("2026-27")
  })

  it("filtre sur l'e-mail de la session, passé en valeur et non concaténé", async () => {
    setup()
    await GET()
    const qs = queriesOn(mocks.admin!, "eleves_connus")
    const filtres = qs.flatMap((q) => q.calls.filter((c) => c.method === "ilike"))
    expect(filtres.map((c) => c.args[0])).toEqual(["email_parent", "email_parent2"])
    for (const c of filtres) expect(c.args[1]).toBe(EMAIL)
    // aucune expression de filtre construite par concaténation
    expect(qs.some((q) => q.calls.some((c) => c.method === "or"))).toBe(false)
  })

  it("écarte les élèves d'un autre parent", async () => {
    setup({ eleves: [SAMUEL, AUTRE] })
    const body = await (await GET()).json()
    expect(body.eleves.map((e: { prenom: string }) => e.prenom)).toEqual(["Samuel"])
  })

  it("ne garde que l'année la plus récente", async () => {
    setup({ eleves: [SAMUEL, VIEUX] })
    const body = await (await GET()).json()
    expect(body.eleves.map((e: { prenom: string }) => e.prenom)).toEqual(["Samuel"])
  })

  it("n'affiche pas un enfant déjà présent dans les profils du compte", async () => {
    setup({ profils: [{ prenom: "samuel" }] })
    const body = await (await GET()).json()
    expect(body.eleves.map((e: { prenom: string }) => e.prenom)).toEqual(["Thomas"])
  })
})

describe("POST /api/eleves-connus", () => {
  const call = async (body: unknown) => {
    const res = await POST(jsonRequest(body) as never)
    return { status: res.status, body: await res.json() }
  }

  it("400 si aucun enfant sélectionné", async () => {
    setup()
    const r = await call({ eleves: [] })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/au moins un/i)
  })

  it("403 si l'élève demandé n'est pas rattaché au compte", async () => {
    setup({ eleves: [AUTRE] })
    expect((await call({ eleves: [{ id: "e3" }] })).status).toBe(403)
  })

  it("crée les profils enfants avec active=true, type_profil=eleve et le bon métier", async () => {
    setup()
    const r = await call({ eleves: [{ id: "e1" }, { id: "e2" }] })
    expect(r.status).toBe(200)
    expect(r.body.created).toBe(2)
    const ins = queriesOn(mocks.admin!, "profils").find((q) => q.op === "insert")!
    const rows = ins.payload as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.active).toBe(true)
      expect(row.type_profil).toBe("eleve")
      expect(row.metier).toBe("pandattitude")
      expect(row.account_id).toBe(ACCOUNT)
    }
    expect(rows.map((r) => r.classe)).toEqual(["mercredi", "samedi"])
  })

  it("le créneau choisi par le parent prime sur celui de la liste", async () => {
    setup()
    await call({ eleves: [{ id: "e1", classe: "Samedi" }] })
    const ins = queriesOn(mocks.admin!, "profils").find((q) => q.op === "insert")!
    expect((ins.payload as Array<{ classe: string }>)[0].classe).toBe("samedi")
  })

  it("400 quand le créneau est inexploitable et non fourni", async () => {
    setup({ eleves: [{ ...SAMUEL, classe: "CM2" }] })
    const r = await call({ eleves: [{ id: "e1" }] })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/créneau/i)
  })

  // ---- Régression PS-05 §A-11 : collision is_default avec le profil parent du trigger ----

  it("ne repose pas is_default quand un profil par défaut existe déjà", async () => {
    setup({ defautsExistants: 1 })
    await call({ eleves: [{ id: "e1" }, { id: "e2" }] })
    const ins = queriesOn(mocks.admin!, "profils").find((q) => q.op === "insert")!
    expect((ins.payload as Array<{ is_default: boolean }>).map((r) => r.is_default)).toEqual([false, false])
  })

  it("marque un seul profil par défaut quand le compte n'en a aucun", async () => {
    setup({ defautsExistants: 0 })
    await call({ eleves: [{ id: "e1" }, { id: "e2" }] })
    const ins = queriesOn(mocks.admin!, "profils").find((q) => q.op === "insert")!
    expect((ins.payload as Array<{ is_default: boolean }>).map((r) => r.is_default)).toEqual([true, false])
  })

  // ---- Régression PS-05 §A-11 : l'insert échouait en silence ----

  it("remonte l'erreur Postgres au lieu de répondre success", async () => {
    setup({ insertResult: { error: { message: 'duplicate key value violates unique constraint "profils_default_uniq"' } } })
    const r = await call({ eleves: [{ id: "e1" }] })
    expect(r.status).toBe(500)
    expect(r.body.error).toMatch(/profils_default_uniq/)
    expect(r.body.created).toBeUndefined()
  })

  it("refuse de répondre success quand l'insert ne rend aucune ligne", async () => {
    setup({ insertResult: { data: [] } })
    const r = await call({ eleves: [{ id: "e1" }] })
    expect(r.status).toBe(500)
    expect(r.body.created).toBeUndefined()
  })
})
