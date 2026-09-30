// PS-12 — Planche d'étiquettes Office Star OS43425 : A4, 2 colonnes × 5 lignes = 10 cases,
// numérotées dans l'ordre de LECTURE (case 1 = haut gauche, 2 = haut droite, puis ligne
// suivante). Gère une planche entamée : certaines cases sont déjà utilisées (vides à
// l'impression), les étiquettes remplissent les cases LIBRES dans l'ordre, débordement sur
// une planche neuve. Logique pure, testée. (Ne touche ni composeItemLabel ni le filtre.)

export const SHEET_COLS = 2
export const SHEET_ROWS = 5
export const CELLS_PER_SHEET = SHEET_COLS * SHEET_ROWS // 10

export interface PlacedCell {
  cell: number            // index 0..9 (ordre de lecture)
  labelIndex: number | null // index de l'étiquette placée, ou null (case vide/utilisée)
  used: boolean           // case déjà utilisée sur la planche entamée
}
export interface PlancheSheet { cells: PlacedCell[] }

function normalizeUsed(usedCells: number[] | undefined): Set<number> {
  return new Set((usedCells || []).filter((c) => Number.isInteger(c) && c >= 0 && c < CELLS_PER_SHEET))
}

/**
 * Répartit `labelCount` étiquettes en planches. La 1ʳᵉ planche saute les cases `usedCells`
 * (déjà utilisées) ; les suivantes sont neuves (10 cases libres).
 */
export function planLabels(labelCount: number, usedCells: number[] = []): PlancheSheet[] {
  const used = normalizeUsed(usedCells)
  const sheets: PlancheSheet[] = []
  let li = 0

  // 1ʳᵉ planche (entamée)
  const first: PlacedCell[] = []
  for (let c = 0; c < CELLS_PER_SHEET; c++) {
    if (used.has(c)) first.push({ cell: c, labelIndex: null, used: true })
    else if (li < labelCount) first.push({ cell: c, labelIndex: li++, used: false })
    else first.push({ cell: c, labelIndex: null, used: false })
  }
  sheets.push({ cells: first })

  // Débordement → planches neuves
  while (li < labelCount) {
    const cells: PlacedCell[] = []
    for (let c = 0; c < CELLS_PER_SHEET; c++) {
      if (li < labelCount) cells.push({ cell: c, labelIndex: li++, used: false })
      else cells.push({ cell: c, labelIndex: null, used: false })
    }
    sheets.push({ cells })
  }
  return sheets
}

/**
 * Cases utilisées sur la planche PHYSIQUE après cette impression (mémoire de planche) :
 * - sans débordement : anciennes cases utilisées + cases fraîchement remplies ;
 * - avec débordement : la dernière planche neuve, ses N premières cases remplies.
 */
export function usedAfterPrint(labelCount: number, usedCells: number[] = []): number[] {
  const used = normalizeUsed(usedCells)
  const free = CELLS_PER_SHEET - used.size
  if (labelCount <= free) {
    const filled: number[] = []
    let n = labelCount
    for (let c = 0; c < CELLS_PER_SHEET && n > 0; c++) {
      if (!used.has(c)) { filled.push(c); n-- }
    }
    return [...used, ...filled].sort((a, b) => a - b)
  }
  const remaining = labelCount - free
  const lastFill = remaining % CELLS_PER_SHEET === 0 ? CELLS_PER_SHEET : remaining % CELLS_PER_SHEET
  return Array.from({ length: lastFill }, (_, i) => i)
}

/** « Commencer à la case n° N » (1-based) → cases 1..N-1 marquées utilisées. */
export function usedForStartCell(startCell: number): number[] {
  const n = Math.max(1, Math.min(CELLS_PER_SHEET, Math.floor(startCell)))
  return Array.from({ length: n - 1 }, (_, i) => i)
}
