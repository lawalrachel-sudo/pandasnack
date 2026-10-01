import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.stubEnv("ADMIN_COOKIE_SECRET", "test-secret-mw")
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co")
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon")

// Pas de session Supabase (accès admin = cookie mot de passe).
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

// PS-13c — on pilote la reconnaissance d'appareil de confiance sans toucher la base.
const tmocks = vi.hoisted(() => ({ device: null as null | { id: string; token_hash: string; device_label: string | null } }))
vi.mock("@/lib/auth/trusted-device", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/trusted-device")>()
  return { ...actual, lookupTrustedDevice: async () => tmocks.device, touchTrustedDevice: async () => {} }
})

import { updateSession } from "./middleware"
import { signAdminSession, ADMIN_COOKIE_NAME } from "@/lib/auth/admin-session"
import { TRUSTED_COOKIE_NAME } from "@/lib/auth/trusted-device"

function req(path: string, cookie?: string, trusted?: string) {
  const r = new NextRequest(new URL(`http://localhost${path}`))
  if (cookie) r.cookies.set(ADMIN_COOKIE_NAME, cookie)
  if (trusted) r.cookies.set(TRUSTED_COOKIE_NAME, trusted)
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

describe("middleware — appareil de confiance (PS-13c)", () => {
  afterEach(() => { tmocks.device = null })

  it("appareil reconnu, sans admin_session → entrée directe : ré-émet admin_session (pas de mot de passe)", async () => {
    tmocks.device = { id: "d1", token_hash: "h", device_label: "Samsung · Chrome" }
    const res = await updateSession(req("/admin/home", undefined, "tok-reconnu"))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get("location") || "").pathname).toBe("/admin/home") // même page, pas /admin
    const setCookie = res.cookies.get(ADMIN_COOKIE_NAME)
    expect(setCookie?.value).toBeTruthy()
    expect(setCookie?.maxAge).toBe(60 * 60 * 24 * 90) // admin_session 90 j ré-émis
    expect(res.cookies.get(TRUSTED_COOKIE_NAME)?.maxAge).toBe(60 * 60 * 24 * 365) // confiance renouvelée 1 an
  })

  it("appareil reconnu sur la page /admin → redirige directement vers /admin/home", async () => {
    tmocks.device = { id: "d1", token_hash: "h", device_label: "Mac · Safari" }
    const res = await updateSession(req("/admin", undefined, "tok-reconnu"))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get("location") || "").pathname).toBe("/admin/home")
    expect(res.cookies.get(ADMIN_COOKIE_NAME)?.value).toBeTruthy()
  })

  it("appareil RETIRÉ (jeton inconnu en base) → mot de passe : /admin, aucun admin_session posé", async () => {
    tmocks.device = null // lookup ne trouve rien
    const res = await updateSession(req("/admin/home", undefined, "tok-retire"))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get("location") || "").pathname).toBe("/admin")
    expect(res.cookies.get(ADMIN_COOKIE_NAME)?.value).toBeFalsy()
  })

  it("jeton falsifié (non reconnu) → mot de passe", async () => {
    tmocks.device = null
    const res = await updateSession(req("/admin/caisse", undefined, "tok-falsifie"))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get("location") || "").pathname).toBe("/admin")
  })
})
