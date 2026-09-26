import { beforeEach, describe, expect, it, vi } from "vitest"

// admin-cookie utilise node:crypto + process.env.ADMIN_COOKIE_SECRET.
vi.stubEnv("ADMIN_COOKIE_SECRET", "test-secret-ps05b")

import {
  ADMIN_COOKIE_MAX_AGE,
  adminCookieOptions,
  createAdminSessionValue,
  verifyAdminSessionValue,
} from "./admin-cookie"

describe("session admin (PS-05b)", () => {
  it("dure 90 jours", () => {
    expect(ADMIN_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 90)
  })

  it("adminCookieOptions : httpOnly, sameSite lax, path /, maxAge 90j", () => {
    const o = adminCookieOptions()
    expect(o.httpOnly).toBe(true)
    expect(o.sameSite).toBe("lax")
    expect(o.path).toBe("/")
    expect(o.maxAge).toBe(ADMIN_COOKIE_MAX_AGE)
  })

  it("un cookie fraîchement créé est valide", () => {
    expect(verifyAdminSessionValue(createAdminSessionValue())).toBe(true)
  })

  it("cookie absent → invalide", () => {
    expect(verifyAdminSessionValue(undefined)).toBe(false)
    expect(verifyAdminSessionValue(null)).toBe(false)
    expect(verifyAdminSessionValue("")).toBe(false)
  })

  it("signature falsifiée → invalide", () => {
    const v = createAdminSessionValue()
    const tampered = v.slice(0, -3) + "xyz"
    expect(verifyAdminSessionValue(tampered)).toBe(false)
  })

  it("cookie expiré → invalide", () => {
    // On forge un payload expiré signé avec le vrai secret via une horloge reculée.
    const realNow = Date.now
    Date.now = () => realNow() - (ADMIN_COOKIE_MAX_AGE + 10) * 1000
    const expired = createAdminSessionValue()
    Date.now = realNow
    expect(verifyAdminSessionValue(expired)).toBe(false)
  })

  it("payload trafiqué (exp rallongé après signature) → invalide", () => {
    const v = createAdminSessionValue()
    const sig = v.slice(v.lastIndexOf(".") + 1)
    const forged = `admin.${Math.floor(Date.now() / 1000) + 99999}.${sig}`
    expect(verifyAdminSessionValue(forged)).toBe(false)
  })
})

describe("secret manquant", () => {
  beforeEach(() => vi.stubEnv("ADMIN_COOKIE_SECRET", ""))
  it("verify renvoie false plutôt que de crasher", () => {
    expect(verifyAdminSessionValue("admin.9999999999.whatever")).toBe(false)
  })
})
