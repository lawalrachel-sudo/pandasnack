import { afterEach, describe, expect, it } from "vitest"
import { checkPontBearer } from "./pont-secret"

const OLD = process.env.PANDA_SNACK_PONT_SECRET
afterEach(() => { process.env.PANDA_SNACK_PONT_SECRET = OLD })

describe("checkPontBearer (PS-23b)", () => {
  it("refuse sans secret serveur", () => {
    delete process.env.PANDA_SNACK_PONT_SECRET
    expect(checkPontBearer("Bearer whatever")).toBe(false)
  })
  it("refuse un mauvais token / une longueur différente / un header absent", () => {
    process.env.PANDA_SNACK_PONT_SECRET = "s3cr3t-pont"
    expect(checkPontBearer("Bearer mauvais")).toBe(false)
    expect(checkPontBearer("Bearer s3cr3t")).toBe(false)
    expect(checkPontBearer(null)).toBe(false)
    expect(checkPontBearer("s3cr3t-pont")).toBe(false) // pas de préfixe Bearer
  })
  it("accepte le bon token", () => {
    process.env.PANDA_SNACK_PONT_SECRET = "s3cr3t-pont"
    expect(checkPontBearer("Bearer s3cr3t-pont")).toBe(true)
  })
})
