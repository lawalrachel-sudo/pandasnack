import { beforeEach, describe, expect, it, vi } from "vitest"

vi.stubEnv("ADMIN_COOKIE_SECRET", "test-secret-renew")

const store = vi.hoisted(() => ({ value: undefined as string | undefined, set: vi.fn() }))
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (store.value !== undefined ? { name: n, value: store.value } : undefined) }),
}))

import { POST } from "./route"
import { createAdminSessionValue } from "@/lib/auth/admin-cookie"

beforeEach(() => { store.value = undefined; store.set.mockReset() })

describe("POST /api/admin/renew", () => {
  it("cookie valide → renewed:true et ré-émission", async () => {
    store.value = createAdminSessionValue()
    const res = await POST()
    const body = await res.json()
    expect(body.renewed).toBe(true)
    // le cookie est ré-émis dans la réponse
    expect(res.cookies.get("admin_session")?.value).toBeTruthy()
  })

  it("cookie absent → renewed:false, pas de cookie posé", async () => {
    store.value = undefined
    const res = await POST()
    expect((await res.json()).renewed).toBe(false)
    expect(res.cookies.get("admin_session")).toBeFalsy()
  })

  it("cookie falsifié → renewed:false", async () => {
    store.value = "admin.9999999999.forged"
    const res = await POST()
    expect((await res.json()).renewed).toBe(false)
  })
})
