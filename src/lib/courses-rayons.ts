// PS-25 — Référentiel des rayons de la liste de courses. L'ordre = ordre de visite en magasin,
// modifiable ici. Catégorisation initiale côté SQL (courses_categorie). Lib pure, testée.

export interface Rayon { key: string; label: string }

export const RAYONS: Rayon[] = [
  { key: "fruits_legumes", label: "Fruits & légumes" },
  { key: "pain", label: "Pain" },
  { key: "boucherie", label: "Boucherie" },
  { key: "frais", label: "Frais" },
  { key: "epicerie", label: "Épicerie" },
  { key: "epices_sauces", label: "Épices & sauces" },
  { key: "boissons", label: "Boissons" },
  { key: "bubble_tea", label: "Bubble Tea" },
  { key: "gouter", label: "Goûter & comptoir" },
  { key: "surgeles", label: "Surgelés" },
  { key: "emballages", label: "Emballages" },
  { key: "hygiene", label: "Hygiène" },
  { key: "autre", label: "Autre" },
]
const ORDER: Record<string, number> = Object.fromEntries(RAYONS.map((r, i) => [r.key, i]))

export function rayonLabel(key: string): string {
  return RAYONS.find((r) => r.key === key)?.label ?? "Autre"
}
export function rayonOrdre(key: string): number {
  return ORDER[key] ?? RAYONS.length
}

export interface CourseItem { id: string; categorie: string; coche?: boolean; [k: string]: unknown }

// Tri des cartes : par ordre de rayon, puis ordre d'insertion conservé par l'appelant.
export function trierParRayon<T extends CourseItem>(items: T[]): T[] {
  return [...items].sort((a, b) => rayonOrdre(a.categorie) - rayonOrdre(b.categorie))
}

// Pilules : « Tout (N) » + une pilule par rayon présent, avec le nombre d'articles RESTANTS (non cochés).
// Une pilule dont tous les articles sont cochés est grisée (restants = 0).
export interface Pilule { key: string; label: string; restants: number; total: number }
export function pilules(items: CourseItem[]): { tout: number; rayons: Pilule[] } {
  const parRayon = new Map<string, { total: number; restants: number }>()
  for (const it of items) {
    const e = parRayon.get(it.categorie) || { total: 0, restants: 0 }
    e.total += 1
    if (!it.coche) e.restants += 1
    parRayon.set(it.categorie, e)
  }
  const rayons = [...parRayon.entries()]
    .map(([key, e]) => ({ key, label: rayonLabel(key), restants: e.restants, total: e.total }))
    .sort((a, b) => rayonOrdre(a.key) - rayonOrdre(b.key))
  const tout = items.filter((i) => !i.coche).length
  return { tout, rayons }
}
