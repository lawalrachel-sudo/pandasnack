import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.stubEnv("ADMIN_COOKIE_SECRET", "test-secret-mw")
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co")
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon")

// Pas de session Supabase (accès admin = cookie mot de passe).
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

import { updateSession } from "./middleware"
import { signAdminSession, ADMIN_COOKIE_NAME } from "@/lib/auth/admin-session"

function req(path: string, cookie?: string) {
  const r = new NextRequest(new URL(`http://localhost${path}`))
  if (cookie) r.cookies.set(ADMIN_COOKIE_NAME, cookie)
  return r
}

describe("middleware — accès admin (PS-11)", () => {
  it("page /admin/* sans cookie → redirection vers /admin?next=… (jamais vers /)", async () => {
    const res = await updateSession(req("/admin/home"))
    expect(res.status).toBe(307)
    const loc = res.headers.get("location") || ""
    expect(loc).toContain("/admin")
    expect(loc).toContain("next=%2Fadmin%2Fhome")
    expect(new URL(loc).pathname).toBe("/admin")   // pas "/"
  })

  it("page /admin/* avec cookie valide → passe et RENOUVELLE le cookie (navigation)", async () => {
    const valid = await signAdminSession("test-secret-mw")
    const res = await updateSession(req("/admin/home", valid))
    expect(res.status).toBe(200)
    const setCookie = res.cookies.get(ADMIN_COOKIE_NAME)
    expect(setCookie?.value).toBeTruthy()
    expect(setCookie?.maxAge).toBe(60 * 60 * 24 * 90)   // 90 j ré-émis
  })

  it("la page de connexion /admin sans cookie n'est pas redirigée", async () => {
    const res = await updateSession(req("/admin"))
    expect(res.status).toBe(200)
  })

  it("cookie invalide sur /admin/* → redirection /admin?next", async () => {
    const res = await updateSession(req("/admin/caisse", "admin.9999999999.forged"))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get("location") || "").pathname).toBe("/admin")
  })
})
