import { describe, expect, it } from "vitest"
import {
  deviceLabelFromUA, generateTrustedToken, hashTrustedToken,
  TRUSTED_COOKIE_MAX_AGE,
} from "./trusted-device"

describe("PS-13c — trusted-device helpers", () => {
  describe("deviceLabelFromUA", () => {
    it("Samsung Android Chrome", () => {
      const ua = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36"
      expect(deviceLabelFromUA(ua)).toBe("Samsung · Chrome")
    })
    it("Mac Safari", () => {
      const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
      expect(deviceLabelFromUA(ua)).toBe("Mac · Safari")
    })
    it("iPhone", () => {
      const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"
      expect(deviceLabelFromUA(ua)).toContain("iPhone")
    })
    it("UA vide → libellé générique, jamais de crash", () => {
      expect(deviceLabelFromUA(null)).toBe("Appareil")
      expect(deviceLabelFromUA(undefined)).toBe("Appareil")
    })
  })

  describe("jetons", () => {
    it("hashTrustedToken est déterministe (SHA-256 hex, 64 car.)", async () => {
      const h1 = await hashTrustedToken("abc")
      const h2 = await hashTrustedToken("abc")
      expect(h1).toBe(h2)
      expect(h1).toMatch(/^[0-9a-f]{64}$/)
      expect(await hashTrustedToken("abd")).not.toBe(h1)
    })
    it("generateTrustedToken produit des jetons uniques et url-safe", () => {
      const a = generateTrustedToken(), b = generateTrustedToken()
      expect(a).not.toBe(b)
      expect(a).not.toMatch(/[+/=]/)
      expect(a.length).toBeGreaterThanOrEqual(42)
    })
    it("cookie de confiance = 1 an", () => {
      expect(TRUSTED_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365)
    })
  })
})
