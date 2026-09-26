import { describe, expect, it } from "vitest"
import { GET } from "./route"

describe("manifest admin (PS-05b)", () => {
  it("sert un manifest avec le scope /admin/ et le bon content-type", async () => {
    const res = GET()
    expect(res.headers.get("Content-Type")).toContain("manifest")
    const m = await res.json()
    expect(m.scope).toBe("/admin/")
    expect(m.start_url).toBe("/admin/dashboard")
    expect(m.name).toBe("Admin Panda Snack")
    expect(m.short_name).toBe("Admin PS")
    expect(m.display).toBe("standalone")
  })

  it("référence les icônes 🥘 admin (distinctes du client) + une maskable", () => {
    return GET().json().then((m) => {
      const srcs = m.icons.map((i: { src: string }) => i.src)
      expect(srcs).toContain("/icons/admin-192.png")
      expect(srcs).toContain("/icons/admin-512.png")
      expect(srcs.every((s: string) => s.includes("admin-"))).toBe(true)
      expect(m.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true)
    })
  })
})
