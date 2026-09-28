import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeSupabaseStub, queriesOn, type QueryContext, type StubClient } from "@/test/supabase-stub"

const mocks = vi.hoisted(() => ({ user: null as StubClient | null, admin: null as StubClient | null }))
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => mocks.user }))
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => mocks.admin }))

import { PATCH, POST } from "./route"

const ACCOUNT = "acc-1"
const PROFIL = "prof-1"
const USER = { id: "user-1", email: "parent@exemple.fr" }

function setup(opts: {
  sourceGroup?: string
  existing?: Record<string, unknown> | null
  defauts?: number
  insertError?: unknown
} = {}) {
  mocks.user = makeSupabaseStub({
    user: USER,
    resolve: (ctx: QueryContext) => {
      if (ctx.table === "accounts") return { data: { id: ACCOUNT, source_group: opts.sourceGroup ?? "pandattitude" } }
      if (ctx.table === "profils") {
        if (ctx.op === "insert") {
          if (opts.insertError) return { error: opts.insertError }
          return { data: { id: PROFIL, ...(ctx.payload as object) } }
        }
        if (ctx.op === "update") return { data: [{ id: PROFIL, active: true, classe: "mercredi" }] }
        if (ctx.calls.some((c) => c.method === "eq" && c.args[0] === "is_default")) {
          return { count: opts.defauts ?? 1, data: null }
        }
        return {
          data: opts.existing === undefined
            ? { id: PROFIL, metier: "pandattitude", type_profil: "adulte" }
            : opts.existing,
        }
      }
      return { data: null }
    },
  })
  mocks.admin = makeSupabaseStub({ user: null, resolve: () => ({ data: null }) })
}

const post = async (body: unknown) => {
  const res = await POST(new Request("http://x/api/profils", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) as never)
  return { status: res.status, body: await res.json() }
}
const patch = async (body: unknown) => {
  const res = await PATCH(new Request("http://x/api/profils", { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) as never)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => { mocks.user = null; mocks.admin = null })

describe("POST /api/profils", () => {
  it("crée un profil enfant actif avec type_profil=eleve", async () => {
    setup()
    const r = await post({ prenom: "Samuel", nom: "Test", classe: "mercredi" })
    expect(r.status).toBe(200)
    const ins = queriesOn(mocks.user!, "profils").find((q) => q.op === "insert")!
    const row = ins.payload as Record<string, unknown>
    expect(row.active).toBe(true)
    expect(row.type_profil).toBe("eleve")
    expect(row.classe).toBe("mercredi")
  })

  it("refuse une classe hors référentiel", async () => {
    setup()
    const r = await post({ prenom: "Samuel", nom: "Test", classe: "Mer 3D" })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/Classe invalide/)
  })

  // Régression PS-05c : collision is_default avec le profil parent du trigger
  it("ne repose pas is_default quand un défaut existe déjà", async () => {
    setup({ defauts: 1 })
    await post({ prenom: "Samuel", nom: "Test", classe: "mercredi" })
    const ins = queriesOn(mocks.user!, "profils").find((q) => q.op === "insert")!
    expect((ins.payload as { is_default: boolean }).is_default).toBe(false)
  })

  it("marque par défaut quand le compte n'en a aucun", async () => {
    setup({ defauts: 0 })
    await post({ prenom: "Samuel", nom: "Test", classe: "mercredi" })
    const ins = queriesOn(mocks.user!, "profils").find((q) => q.op === "insert")!
    expect((ins.payload as { is_default: boolean }).is_default).toBe(true)
  })

  it("remonte l'erreur Postgres au lieu de répondre success", async () => {
    setup({ insertError: { message: "violates check constraint" } })
    const r = await post({ prenom: "Samuel", nom: "Test", classe: "mercredi" })
    expect(r.status).toBe(500)
    expect(r.body.success).toBeUndefined()
  })

  it("Panda Guest crée un profil adulte sans classe", async () => {
    setup({ sourceGroup: "panda_guest" })
    await post({ prenom: "Rachel", nom: "Test" })
    const ins = queriesOn(mocks.user!, "profils").find((q) => q.op === "insert")!
    expect((ins.payload as { type_profil: string }).type_profil).toBe("adulte")
  })

  it("PS-06f — créer un profil enfant actif réactive le compte (archived_at=null)", async () => {
    setup()
    await post({ prenom: "Samuel", nom: "Test", classe: "mercredi" })
    const upd = queriesOn(mocks.admin!, "accounts").find((q) => q.op === "update")
    expect(upd).toBeDefined()
    expect((upd!.payload as { archived_at: null }).archived_at).toBeNull()
  })

  it("PS-06f — Panda Guest (profil adulte) ne réactive PAS via ce chemin", async () => {
    setup({ sourceGroup: "panda_guest" })
    await post({ prenom: "Rachel", nom: "Test" })
    expect(queriesOn(mocks.admin!, "accounts").some((q) => q.op === "update")).toBe(false)
  })
})

describe("PATCH /api/profils", () => {
  it("404 si le profil n'appartient pas au compte", async () => {
    setup({ existing: null })
    expect((await patch({ profilId: PROFIL, active: true })).status).toBe(404)
  })

  // ---- Régression PS-05c : un compte avait commandé sur le profil parent réactivé ----

  it("refuse d'activer le profil du compte parent (type_profil != eleve)", async () => {
    setup({ existing: { id: PROFIL, metier: "pandattitude", type_profil: "adulte" } })
    const r = await patch({ profilId: PROFIL, active: true })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/profil du compte parent/i)
  })

  it("autorise la DÉSACTIVATION du profil parent", async () => {
    setup({ existing: { id: PROFIL, metier: "pandattitude", type_profil: "adulte" } })
    expect((await patch({ profilId: PROFIL, active: false })).status).toBe(200)
  })

  it("autorise l'activation d'un profil enfant", async () => {
    setup({ existing: { id: PROFIL, metier: "pandattitude", type_profil: "eleve" } })
    expect((await patch({ profilId: PROFIL, active: true })).status).toBe(200)
  })

  it("autorise l'activation d'un profil adulte en Panda Guest", async () => {
    setup({ existing: { id: PROFIL, metier: "panda_guest", type_profil: "adulte" } })
    expect((await patch({ profilId: PROFIL, active: true })).status).toBe(200)
  })

  // ---- Régression PS-05c : classe='Pandattitude' écrite en texte libre ----

  it("refuse une classe hors référentiel", async () => {
    setup({ existing: { id: PROFIL, metier: "pandattitude", type_profil: "eleve" } })
    const r = await patch({ profilId: PROFIL, classe: "Pandattitude" })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/Classe invalide/)
  })

  it("accepte un créneau du référentiel et l'écrit normalisé", async () => {
    setup({ existing: { id: PROFIL, metier: "pandattitude", type_profil: "eleve" } })
    const r = await patch({ profilId: PROFIL, classe: " mercredi " })
    expect(r.status).toBe(200)
    const upd = queriesOn(mocks.user!, "profils").find((q) => q.op === "update")!
    expect((upd.payload as { classe: string }).classe).toBe("mercredi")
  })

  it("accepte de vider la classe", async () => {
    setup({ existing: { id: PROFIL, metier: "pandattitude", type_profil: "eleve" } })
    await patch({ profilId: PROFIL, classe: "" })
    const upd = queriesOn(mocks.user!, "profils").find((q) => q.op === "update")!
    expect((upd.payload as { classe: null }).classe).toBeNull()
  })

  it("borne l'UPDATE au compte propriétaire", async () => {
    setup({ existing: { id: PROFIL, metier: "pandattitude", type_profil: "eleve" } })
    await patch({ profilId: PROFIL, active: true })
    const upd = queriesOn(mocks.user!, "profils").find((q) => q.op === "update")!
    expect(upd.eq.account_id).toBe(ACCOUNT)
    expect(upd.eq.id).toBe(PROFIL)
  })

  it("400 si aucun champ modifiable n'est fourni", async () => {
    setup({ existing: { id: PROFIL, metier: "pandattitude", type_profil: "eleve" } })
    expect((await patch({ profilId: PROFIL, metier: "ecole" })).status).toBe(400)
  })
})

describe("PATCH /api/profils — plafond goûter (PS-08b)", () => {
  it("accepte null (illimité)", async () => {
    setup({ existing: { id: PROFIL, metier: "pandattitude", type_profil: "eleve" } })
    expect((await patch({ profilId: PROFIL, plafond_gouter_cents: null })).status).toBe(200)
  })
  it("accepte 350 (multiple de 50)", async () => {
    setup({ existing: { id: PROFIL, metier: "pandattitude", type_profil: "eleve" } })
    const r = await patch({ profilId: PROFIL, plafond_gouter_cents: 350 })
    expect(r.status).toBe(200)
    const upd = queriesOn(mocks.user!, "profils").find((q) => q.op === "update")!
    expect((upd.payload as { plafond_gouter_cents: number }).plafond_gouter_cents).toBe(350)
  })
  it("refuse 375 (pas multiple de 50)", async () => {
    setup({ existing: { id: PROFIL, metier: "pandattitude", type_profil: "eleve" } })
    const r = await patch({ profilId: PROFIL, plafond_gouter_cents: 375 })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/Plafond invalide/)
  })
  it("refuse un plafond négatif", async () => {
    setup({ existing: { id: PROFIL, metier: "pandattitude", type_profil: "eleve" } })
    expect((await patch({ profilId: PROFIL, plafond_gouter_cents: -50 })).status).toBe(400)
  })
  it("refuse un plafond > 2000", async () => {
    setup({ existing: { id: PROFIL, metier: "pandattitude", type_profil: "eleve" } })
    expect((await patch({ profilId: PROFIL, plafond_gouter_cents: 2050 })).status).toBe(400)
  })
  it("refuse le profil d'un autre compte", async () => {
    setup({ existing: null })
    expect((await patch({ profilId: PROFIL, plafond_gouter_cents: 350 })).status).toBe(404)
  })
})

describe("POST /api/profils — nom obligatoire (PS-10a)", () => {
  it("refuse sans nom (400)", async () => {
    setup()
    const r = await post({ prenom: "Samuel", classe: "mercredi" })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/Nom requis/)
  })
  it("accepte avec nom (200) et insère le nom", async () => {
    setup()
    const r = await post({ prenom: "Samuel", nom: "Dupont", classe: "mercredi" })
    expect(r.status).toBe(200)
    const ins = queriesOn(mocks.user!, "profils").find((q) => q.op === "insert")!
    expect((ins.payload as { nom: string }).nom).toBe("Dupont")
  })
})
