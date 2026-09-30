import { describe, expect, it } from "vitest"
import { planLabels, usedAfterPrint, usedForStartCell, CELLS_PER_SHEET } from "./etiquettes-planche"

const filledCells = (sheet: { cells: { cell: number; labelIndex: number | null }[] }) =>
  sheet.cells.filter((c) => c.labelIndex !== null).map((c) => c.cell)

describe("planLabels (PS-12)", () => {
  it("planche neuve : 3 étiquettes → cases 0,1,2", () => {
    const [s] = planLabels(3, [])
    expect(filledCells(s)).toEqual([0, 1, 2])
    expect(s.cells[0].labelIndex).toBe(0)
    expect(s.cells[1].labelIndex).toBe(1) // ordre de lecture : case 2 = haut droite
  })

  it("départ case 2 (case 1 utilisée) : étiquettes dès la case 2", () => {
    const [s] = planLabels(2, usedForStartCell(2)) // used = [0]
    expect(s.cells[0].used).toBe(true)
    expect(s.cells[0].labelIndex).toBeNull()
    expect(filledCells(s)).toEqual([1, 2])
  })

  it("trous non contigus : cases 0 et 3 utilisées", () => {
    const [s] = planLabels(4, [0, 3])
    expect(filledCells(s)).toEqual([1, 2, 4, 5]) // saute 0 et 3
    expect(s.cells[3].used).toBe(true)
  })

  it("débordement : 12 étiquettes sur planche neuve → 2 planches (10 + 2)", () => {
    const sheets = planLabels(12, [])
    expect(sheets).toHaveLength(2)
    expect(filledCells(sheets[0])).toHaveLength(10)
    expect(filledCells(sheets[1])).toEqual([0, 1])
  })

  it("débordement depuis une planche entamée : 3 libres, 5 étiquettes → 2 planches", () => {
    const sheets = planLabels(5, [0, 1, 2, 3, 4, 5, 6]) // 7 utilisées → 3 libres (7,8,9)
    expect(filledCells(sheets[0])).toEqual([7, 8, 9])
    expect(filledCells(sheets[1])).toEqual([0, 1]) // 2 restantes sur planche neuve
    expect(sheets).toHaveLength(2)
  })
})

describe("usedAfterPrint (mémoire de planche)", () => {
  it("sans débordement : cases utilisées cumulées", () => {
    expect(usedAfterPrint(2, [0])).toEqual([0, 1, 2])
    expect(usedAfterPrint(3, [])).toEqual([0, 1, 2])
  })
  it("planche exactement remplie → 10 cases utilisées", () => {
    expect(usedAfterPrint(10, [])).toHaveLength(CELLS_PER_SHEET)
  })
  it("avec débordement : mémoire = dernière planche neuve", () => {
    expect(usedAfterPrint(12, [])).toEqual([0, 1])          // 2 sur la 2e planche
    expect(usedAfterPrint(5, [0, 1, 2, 3, 4, 5, 6])).toEqual([0, 1]) // 2 sur planche neuve
  })
  it("débordement pile sur une planche pleine → 10", () => {
    expect(usedAfterPrint(20, [])).toHaveLength(CELLS_PER_SHEET)
  })
})

describe("usedForStartCell", () => {
  it("case 1 → aucune utilisée ; case 2 → [0] ; case 5 → [0..3]", () => {
    expect(usedForStartCell(1)).toEqual([])
    expect(usedForStartCell(2)).toEqual([0])
    expect(usedForStartCell(5)).toEqual([0, 1, 2, 3])
  })
})
