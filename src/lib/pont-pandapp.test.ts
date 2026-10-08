import { describe, expect, it } from "vitest"
import {
  buildPontToken, verifyPontToken, pickPontAccount, childrenToCreate,
  type PontPayload, type PontAccount,
} from "./pont-pandapp"

const SECRET = "test-secret"
const PAYLOAD: PontPayload = {
  v: 1, famille_id: "fam_demo", email_titulaire: "titulaire@example.com", email_parent2: null,
  email_connecte: "titulaire@example.com",
  enfants: [{ profil_id: "p1", prenom: "Lou", nom: "Martin" }],
  iat: 1760000000, exp: 1760000300, nonce: "nonce-demo-1",
}
const VECTOR_TOKEN = "v1.eyJ2IjoxLCJmYW1pbGxlX2lkIjoiZmFtX2RlbW8iLCJlbWFpbF90aXR1bGFpcmUiOiJ0aXR1bGFpcmVAZXhhbXBsZS5jb20iLCJlbWFpbF9wYXJlbnQyIjpudWxsLCJlbWFpbF9jb25uZWN0ZSI6InRpdHVsYWlyZUBleGFtcGxlLmNvbSIsImVuZmFudHMiOlt7InByb2ZpbF9pZCI6InAxIiwicHJlbm9tIjoiTG91Iiwibm9tIjoiTWFydGluIn1dLCJpYXQiOjE3NjAwMDAwMDAsImV4cCI6MTc2MDAwMDMwMCwibm9uY2UiOiJub25jZS1kZW1vLTEifQ.HaFFGoO_1Rv3MlYvtEpvcw7hguSEpPNLnoco4ep1kqI"
const MID = 1760000100  // entre iat et exp

const acc = (id: string, email: string, fam: string | null = null, archived: string | null = null): PontAccount =>
  ({ id, email, pandapp_famille_id: fam, archived_at: archived })

describe("PS-15 — pont-pandapp (lib pure)", () => {
  it("vecteur de test : buildPontToken reproduit le jeton attendu (signature identique à PandApp)", async () => {
    expect(await buildPontToken(SECRET, PAYLOAD)).toBe(VECTOR_TOKEN)
  })

  it("jeton valide → ok + payload décodé", async () => {
    const r = await verifyPontToken(VECTOR_TOKEN, SECRET, MID)
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.payload.famille_id).toBe("fam_demo"); expect(r.payload.enfants[0].prenom).toBe("Lou") }
  })

  it("signature fausse → refus", async () => {
    const bad = VECTOR_TOKEN.slice(0, -1) + (VECTOR_TOKEN.endsWith("A") ? "B" : "A")
    const r = await verifyPontToken(bad, SECRET, MID)
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe("signature")
  })

  it("mauvais secret → refus signature", async () => {
    const r = await verifyPontToken(VECTOR_TOKEN, "autre-secret", MID)
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe("signature")
  })

  it("expiré (now > exp) → refus expired", async () => {
    const r = await verifyPontToken(VECTOR_TOKEN, SECRET, 1760000400)
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe("expired")
  })

  it("iat dans le futur (hors tolérance 60 s) → refus iat_future", async () => {
    const r = await verifyPontToken(VECTOR_TOKEN, SECRET, 1760000000 - 61)
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe("iat_future")
  })

  it("v != 1 → refus version", async () => {
    const t = await buildPontToken(SECRET, { ...PAYLOAD, v: 2 })
    const r = await verifyPontToken(t, SECRET, MID)
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe("version")
  })

  it("format cassé / vide → refus format", async () => {
    expect((await verifyPontToken("", SECRET, MID)).ok).toBe(false)
    expect((await verifyPontToken("v1.abc", SECRET, MID)).ok).toBe(false)
    expect((await verifyPontToken(VECTOR_TOKEN, "", MID)).ok).toBe(false)
  })

  describe("pickPontAccount — ordre famille > titulaire > parent 2", () => {
    it("famille_id prioritaire", () => {
      const r = pickPontAccount(acc("A", "t@x", "fam"), [acc("B", "t@x")], [])
      expect(r.account?.id).toBe("A"); expect(r.action).toBe("conflict") // A et B distincts
    })
    it("titulaire si pas de lien famille", () => {
      const r = pickPontAccount(null, [acc("B", "t@x")], [])
      expect(r.account?.id).toBe("B"); expect(r.conflict).toBe(false); expect(r.action).toBe("matched")
    })
    it("parent 2 en dernier recours", () => {
      const r = pickPontAccount(null, [], [acc("C", "p2@x")])
      expect(r.account?.id).toBe("C"); expect(r.action).toBe("matched")
    })
    it("plusieurs comptes distincts → titulaire + conflict", () => {
      const r = pickPontAccount(null, [acc("B", "t@x")], [acc("C", "p2@x")])
      expect(r.account?.id).toBe("B"); expect(r.conflict).toBe(true); expect(r.action).toBe("conflict")
    })
    it("rien trouvé → none", () => {
      expect(pickPontAccount(null, [], []).action).toBe("none")
    })
  })

  describe("childrenToCreate — jamais de doublon", () => {
    const enfants = [{ profil_id: "p1", prenom: "Lou", nom: "Martin" }, { profil_id: "p2", prenom: "Zoé", nom: "Martin" }]
    it("enfant déjà présent (insensible casse/espaces) non dupliqué", () => {
      const out = childrenToCreate([{ prenom: " lou ", nom: "MARTIN" }], enfants)
      expect(out.map((e) => e.prenom)).toEqual(["Zoé"])
    })
    it("tous nouveaux → tous créés", () => {
      expect(childrenToCreate([], enfants).length).toBe(2)
    })
    it("doublon dans le payload lui-même dédupliqué", () => {
      expect(childrenToCreate([], [...enfants, { profil_id: "p3", prenom: "lou", nom: "martin" }]).length).toBe(2)
    })
    it("enfant sans prénom/nom ignoré", () => {
      expect(childrenToCreate([], [{ profil_id: "p4", prenom: "", nom: "X" }]).length).toBe(0)
    })
  })
})
