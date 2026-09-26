import { describe, expect, it } from "vitest"
import { PARENT_SESSION_MAX_AGE, withLongSession } from "./cookie-options"

describe("withLongSession (session parents 90j)", () => {
  it("allonge un cookie d'auth Supabase à 90 jours", () => {
    const o = withLongSession("sb-ref-auth-token", { path: "/" })
    expect(o.maxAge).toBe(PARENT_SESSION_MAX_AGE)
    expect(o.sameSite).toBe("lax")
  })

  it("s'applique aux cookies chunkés sb-*.0 / .1", () => {
    expect(withLongSession("sb-ref-auth-token.0", {}).maxAge).toBe(PARENT_SESSION_MAX_AGE)
    expect(withLongSession("sb-ref-auth-token.1", {}).maxAge).toBe(PARENT_SESSION_MAX_AGE)
  })

  it("ne touche pas un cookie non Supabase", () => {
    const o = withLongSession("autre_cookie", { maxAge: 10 })
    expect(o.maxAge).toBe(10)
  })

  it("laisse intact un cookie d'effacement (maxAge 0, déconnexion)", () => {
    const o = withLongSession("sb-ref-auth-token", { maxAge: 0 })
    expect(o.maxAge).toBe(0)
  })

  it("préserve les options fournies (path) tout en forçant la durée", () => {
    const o = withLongSession("sb-ref-auth-token", { path: "/", sameSite: "strict" })
    expect(o.path).toBe("/")
    expect(o.sameSite).toBe("strict")   // respecte un choix explicite
    expect(o.maxAge).toBe(PARENT_SESSION_MAX_AGE)
  })
})
