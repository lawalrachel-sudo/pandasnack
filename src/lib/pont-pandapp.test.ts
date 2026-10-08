import { describe, expect, it } from "vitest"
import {
  buildPontToken, verifyPontToken, pickPontAccount, childrenToCreate,
  type PontPayload, type PontAccount,
} from "./pont-pandapp"

const SECRET = "test-secret"
const PAYLOAD: PontPayload = {
  email: "famille@example.com", familleId: "fam_demo",
  enfants: [{ prenom: "Lou", nom: "Martin" }], tags: ["stages"],
  exp: 1760000300, jti: "jti-demo-1",
}
// Vecteur calculé avec l'algorithme de référence (pandattitude-3d/pandaSnack.ts, node:crypto).
const VECTOR_TOKEN = "eyJlbWFpbCI6ImZhbWlsbGVAZXhhbXBsZS5jb20iLCJmYW1pbGxlSWQiOiJmYW1fZGVtbyIsImVuZmFudHMiOlt7InByZW5vbSI6IkxvdSIsIm5vbSI6Ik1hcnRpbiJ9XSwidGFncyI6WyJzdGFnZXMiXSwiZXhwIjoxNzYwMDAwMzAwLCJqdGkiOiJqdGktZGVtby0xIn0.QNQ48f3XasbrQ25mwgl7HiAf7mhHw6BXSdt2w3iBxjg"
const BEFORE_EXP = 1760000200
const AFTER_EXP = 1760000400

const acc = (id: string, email: string, fam: string | null = null): PontAccount =>
  ({ id, email, pandapp_famille_id: fam, archived_at: null })

describe("PS-15 — pont-pandapp (lib pure, contrat pandattitude-3d)", () => {
  it("vecteur de test : buildPontToken reproduit le jeton de référence (signature identique à PandApp)", async () => {
    expect(await buildPontToken(SECRET, PAYLOAD)).toBe(VECTOR_TOKEN)
  })

  it("jeton valide → ok + payload décodé (email, familleId, enfants, tags)", async () => {
    const r = await verifyPontToken(VECTOR_TOKEN, SECRET, BEFORE_EXP)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.payload.familleId).toBe("fam_demo")
      expect(r.payload.enfants[0]).toEqual({ prenom: "Lou", nom: "Martin" })
      expect(r.payload.tags).toContain("stages")
    }
  })

  it("signature invalide → refus", async () => {
    const bad = VECTOR_TOKEN.slice(0, -1) + (VECTOR_TOKEN.endsWith("g") ? "h" : "g")
    const r = await verifyPontToken(bad, SECRET, BEFORE_EXP)
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe("signature")
  })

  it("mauvais secret → refus signature", async () => {
    const r = await verifyPontToken(VECTOR_TOKEN, "autre", BEFORE_EXP)
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe("signature")
  })

  it("jeton expiré (exp < now) → refus expired", async () => {
    const r = await verifyPontToken(VECTOR_TOKEN, SECRET, AFTER_EXP)
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe("expired")
  })

  it("format cassé / vide → refus format", async () => {
    expect((await verifyPontToken("", SECRET, BEFORE_EXP)).ok).toBe(false)
    expect((await verifyPontToken("abc", SECRET, BEFORE_EXP)).ok).toBe(false)
    expect((await verifyPontToken(VECTOR_TOKEN, "", BEFORE_EXP)).ok).toBe(false)
  })

  describe("pickPontAccount — famille_id puis e-mail du payload", () => {
    it("famille_id prioritaire", () => {
      const r = pickPontAccount(acc("A", "x@x", "fam"), [acc("B", "x@x")])
      expect(r.account?.id).toBe("A"); expect(r.action).toBe("conflict")
    })
    it("e-mail si pas de lien famille", () => {
      const r = pickPontAccount(null, [acc("B", "x@x")])
      expect(r.account?.id).toBe("B"); expect(r.conflict).toBe(false); expect(r.action).toBe("matched")
    })
    it("plusieurs comptes distincts → e-mail du payload + conflict", () => {
      const r = pickPontAccount(null, [acc("B", "x@x"), acc("C", "x@x")])
      expect(r.account?.id).toBe("B"); expect(r.conflict).toBe(true); expect(r.action).toBe("conflict")
    })
    it("rien → none", () => {
      expect(pickPontAccount(null, []).action).toBe("none")
    })
  })

  describe("childrenToCreate — jamais de doublon", () => {
    const enfants = [{ prenom: "Lou", nom: "Martin" }, { prenom: "Zoé", nom: "Martin" }]
    it("enfant déjà présent (insensible casse/espaces) non dupliqué", () => {
      expect(childrenToCreate([{ prenom: " lou ", nom: "MARTIN" }], enfants).map((e) => e.prenom)).toEqual(["Zoé"])
    })
    it("tous nouveaux → tous créés", () => {
      expect(childrenToCreate([], enfants).length).toBe(2)
    })
    it("doublon dans le payload dédupliqué", () => {
      expect(childrenToCreate([], [...enfants, { prenom: "lou", nom: "martin" }]).length).toBe(2)
    })
  })
})
