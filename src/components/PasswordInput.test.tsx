// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { PasswordInput } from "./PasswordInput"

afterEach(cleanup)

describe("PasswordInput (PS-09a-b)", () => {
  it("masqué par défaut, clic → text, re-clic → password ; aria-label suit", () => {
    render(<PasswordInput value="secret" onChange={() => {}} placeholder="mdp" />)
    const input = screen.getByPlaceholderText("mdp") as HTMLInputElement
    expect(input.type).toBe("password")

    const btn = screen.getByRole("button", { name: "Afficher le mot de passe" })
    fireEvent.click(btn)
    expect(input.type).toBe("text")
    expect(screen.getByRole("button", { name: "Masquer le mot de passe" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Masquer le mot de passe" }))
    expect(input.type).toBe("password")
  })

  it("transmet autoComplete et name tels quels", () => {
    render(<PasswordInput value="" onChange={() => {}} name="new-pw" autoComplete="new-password" placeholder="x" />)
    const input = screen.getByPlaceholderText("x") as HTMLInputElement
    expect(input.getAttribute("name")).toBe("new-pw")
    expect(input.getAttribute("autocomplete")).toBe("new-password")
  })

  it("état indépendant par champ", () => {
    render(<>
      <PasswordInput value="" onChange={() => {}} placeholder="a" />
      <PasswordInput value="" onChange={() => {}} placeholder="b" />
    </>)
    const a = screen.getByPlaceholderText("a") as HTMLInputElement
    const b = screen.getByPlaceholderText("b") as HTMLInputElement
    fireEvent.click(screen.getAllByRole("button", { name: "Afficher le mot de passe" })[0])
    expect(a.type).toBe("text")
    expect(b.type).toBe("password")
  })
})
