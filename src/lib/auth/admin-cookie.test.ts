import { beforeEach, describe, expect, it, vi } from "vitest"

vi.stubEnv("ADMIN_COOKIE_SECRET", "test-secret-ps05b")

import { ADMIN_COOKIE_MAX_AGE, adminCookieOptions, createAdminSessionValue, verifyAdminSessionValue } from "./admin-cookie"

describe("session admin (PS-05b / PS-11)", () => {
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

  it("un cookie fraîchement créé est valide (validation partagée)", async () => {
    expect(await verifyAdminSessionValue(await createAdminSessionValue())).toBe(true)
  })

  it("cookie absent → invalide", async () => {
    expect(await verifyAdminSessionValue(undefined)).toBe(false)
    expect(await verifyAdminSessionValue(null)).toBe(false)
    expect(await verifyAdminSessionValue("")).toBe(false)
  })

  it("signature falsifiée → invalide", async () => {
    const v = await createAdminSessionValue()
    expect(await verifyAdminSessionValue(v.slice(0, -3) + "xyz")).toBe(false)
  })

  it("cookie expiré → invalide", async () => {
    const realNow = Date.now
    Date.now = () => realNow() - (ADMIN_COOKIE_MAX_AGE + 10) * 1000
    const expired = await createAdminSessionValue()
    Date.now = realNow
    expect(await verifyAdminSessionValue(expired)).toBe(false)
  })

  it("payload trafiqué (exp rallongé après signature) → invalide", async () => {
    const v = await createAdminSessionValue()
    const sig = v.slice(v.lastIndexOf(".") + 1)
    const forged = `admin.${Math.floor(Date.now() / 1000) + 99999}.${sig}`
    expect(await verifyAdminSessionValue(forged)).toBe(false)
  })
})

describe("secret manquant", () => {
  beforeEach(() => vi.stubEnv("ADMIN_COOKIE_SECRET", ""))
  it("verify renvoie false plutôt que de crasher", async () => {
    expect(await verifyAdminSessionValue("admin.9999999999.whatever")).toBe(false)
  })
})
