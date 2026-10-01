import { describe, expect, it } from "vitest"
import {
  rpConfigFromHost, pickCredential, toB64url, fromB64url,
} from "./passkey"

describe("PS-13c — passkey helpers", () => {
  describe("rpConfigFromHost", () => {
    it("prod : rpID = hostname sans port, origin https", () => {
      const c = rpConfigFromHost("pandasnack.online")
      expect(c.rpID).toBe("pandasnack.online")
      expect(c.origin).toBe("https://pandasnack.online")
    })
    it("localhost : http conservé, port inclus dans l'origin, rpID sans port", () => {
      const c = rpConfigFromHost("localhost:3000")
      expect(c.rpID).toBe("localhost")
      expect(c.origin).toBe("http://localhost:3000")
    })
    it("host vide → localhost par défaut (jamais de crash)", () => {
      expect(rpConfigFromHost(null).rpID).toBe("localhost")
      expect(rpConfigFromHost(undefined).rpID).toBe("localhost")
    })
  })

  describe("pickCredential", () => {
    const rows = [{ credential_id: "AAA" }, { credential_id: "BBB" }]
    it("credential connue → la ligne", () => {
      expect(pickCredential("BBB", rows)?.credential_id).toBe("BBB")
    })
    it("credential INCONNUE → null (la route doit refuser)", () => {
      expect(pickCredential("ZZZ", rows)).toBeNull()
    })
    it("id vide ou pas de lignes → null", () => {
      expect(pickCredential("", rows)).toBeNull()
      expect(pickCredential("AAA", [])).toBeNull()
      expect(pickCredential("AAA", null)).toBeNull()
    })
  })

  describe("base64url round-trip (clé publique COSE)", () => {
    it("encode puis decode rend les octets d'origine", () => {
      const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 42])
      const round = fromB64url(toB64url(bytes))
      expect(Array.from(round)).toEqual(Array.from(bytes))
    })
    it("pas de caractères + / = dans la sortie", () => {
      const s = toB64url(new Uint8Array([255, 254, 253, 252]))
      expect(s).not.toMatch(/[+/=]/)
    })
  })
})
