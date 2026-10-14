// PS-23 — Règles pures du stock Bubble Tea (sirop + perles). Miroir des mouvements SQL
// (bubble_sync_order, comptoir_sell/reverse) : 1 dose de sirop + 1 dose de perles par Bubble Tea.
// Stock en ml (sirop) / g (perles) ; doses dérivées. Testée.

export type BubbleKind = "sirop" | "perles"

export const DOSE_SIROP_ML = 30
export const DOSE_PERLES_G = 78

export interface BubbleOption {
  id: string
  kind: BubbleKind
  name: string
  active: boolean
  sort_order: number
  unite: string          // 'ml' | 'g'
  dose: number           // 30 | 78
  seuil_doses: number
}
export interface BubbleStock extends BubbleOption {
  stock: number          // ml ou g
  doses_restantes: number
  alerte: boolean
}

// Conditionnements d'achat (réassort) → quantité en base (ml/g) + doses.
export interface Conditionnement { key: string; label: string; kind: BubbleKind; base: number; doses: number }
export const CONDITIONNEMENTS: Conditionnement[] = [
  { key: "sirop_750", label: "Bouteille 750 ml", kind: "sirop", base: 750, doses: 25 },
  { key: "sirop_1500", label: "Bouteille 1,5 L", kind: "sirop", base: 1500, doses: 50 },
  { key: "perles_3200", label: "Pot 3,2 kg", kind: "perles", base: 3200, doses: 41 },
]
export function conditionnementsFor(kind: BubbleKind): Conditionnement[] {
  return CONDITIONNEMENTS.filter((c) => c.kind === kind)
}

export function dosesRestantes(stockBase: number, dose: number): number {
  if (!dose) return 0
  return Math.floor(stockBase / dose)
}
export function estEpuise(dosesRestantes: number): boolean {
  return dosesRestantes < 1
}
export function estAlerte(dosesRestantes: number, seuil: number): boolean {
  return dosesRestantes < seuil
}

// Inventaire : mouvement = stock réel compté − stock estimé (même unité, ml/g). Signe quelconque.
export function inventaireDelta(reelBase: number, estimeBase: number): number {
  return Math.round((reelBase - estimeBase) * 100) / 100
}

// Affichage stock : « 450 ml · 15 doses ».
export function fmtStock(stockBase: number, unite: string, dose: number): string {
  return `${Math.round(stockBase)} ${unite} · ${dosesRestantes(stockBase, dose)} doses`
}

// Feuille de route : total par sirop et par perle des Bubble Tea à préparer (jour).
export interface BubbleRef { siropName?: string | null; perlesName?: string | null; quantity?: number }
export function bubbleTotals(items: BubbleRef[]): { parSirop: { name: string; count: number }[]; parPerles: { name: string; count: number }[] } {
  const sirop = new Map<string, number>()
  const perles = new Map<string, number>()
  for (const it of items) {
    const q = it.quantity && it.quantity > 0 ? it.quantity : 1
    if (it.siropName) sirop.set(it.siropName, (sirop.get(it.siropName) || 0) + q)
    if (it.perlesName) perles.set(it.perlesName, (perles.get(it.perlesName) || 0) + q)
  }
  const toArr = (m: Map<string, number>) => [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
  return { parSirop: toArr(sirop), parPerles: toArr(perles) }
}

// Libellé « Mangue / Passion » (sirop / perles) pour les récaps.
export function bubbleChoiceLabel(siropName?: string | null, perlesName?: string | null): string | null {
  if (!siropName && !perlesName) return null
  return `${siropName || "?"} / ${perlesName || "?"}`
}
