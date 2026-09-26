// PS-06b — Règles de la vue « Service du jour » (admin).
//
// Logique pure, sans accès réseau : classification des commandes d'un service,
// compteurs d'en-tête, tri de la liste à préparer, et totaux de la feuille de route.
// Testée dans service-du-jour.test.ts.
//
// RÈGLE CARDINALE (audit PS-05 §A / brief §5) : le STATUT prime sur paid_at partout.
// Une commande `cancelled` n'est jamais « encaissée », jamais comptée, même si son
// paid_at est renseigné.

export type OrderStatus = "paid" | "pending_payment" | "cancelled" | string

export interface SvcItem {
  notes: string | null
  menu_formula_name: string | null
  catalog_item_name: string | null
  catalog_item_sku: string | null
  category_id: string | null
  qty: number
}

export interface SvcOrder {
  id: string
  order_number: string
  status: OrderStatus
  payment_method: string | null
  paid_at: string | null
  payment_mode: string | null
  prepared_at: string | null
  total_cents: number
  special_request: string | null
  created_at: string
  account_id?: string | null
  is_test: boolean
  child_prenom: string | null
  child_classe: string | null
  notes_allergies: string | null
  parent_nom: string | null
  parent_telephone: string | null
  items: SvcItem[]
}

// ── Prédicats unitaires ─────────────────────────────────────────────────────

/** Commande à préparer : payée, ou sur place (pending + on_site). Jamais annulée. */
export function isProduction(o: SvcOrder): boolean {
  if (o.status === "cancelled") return false
  return o.status === "paid" || (o.status === "pending_payment" && o.payment_method === "on_site")
}

/** Reste à encaisser au comptoir : sur place, pas encore encaissé, non annulée. */
export function isToCollect(o: SvcOrder): boolean {
  return o.status !== "cancelled" && o.payment_method === "on_site" && !o.paid_at
}

/** Encaissée / réglée : le STATUT fait foi, pas paid_at. */
export function isPaid(o: SvcOrder): boolean {
  return o.status === "paid"
}

export function isPrepared(o: SvcOrder): boolean {
  return !!o.prepared_at
}

// ── Détection Bubble Tea (compteur d'en-tête §10) ───────────────────────────

export function isBubbleTea(it: SvcItem): boolean {
  if (it.catalog_item_sku === "DRINK-BBL") return true
  return /bubble\s*tea/i.test(it.catalog_item_name || "")
}

// ── Sections (§3/§4/§5/§7) ──────────────────────────────────────────────────

export interface Sections {
  aPreparer: SvcOrder[]   // production, hors comptes test
  nonPayees: SvcOrder[]   // pending_payment hors on_site, hors test (brouillons abandonnés)
  annulees: SvcOrder[]    // cancelled, hors test
  test: SvcOrder[]        // tout compte is_test, non annulé
}

export function classifySections(orders: SvcOrder[]): Sections {
  const real = orders.filter((o) => !o.is_test)
  return {
    aPreparer: sortAPreparer(real.filter(isProduction)),
    nonPayees: real.filter((o) => o.status === "pending_payment" && o.payment_method !== "on_site"),
    annulees: real.filter((o) => o.status === "cancelled"),
    test: orders.filter((o) => o.is_test && o.status !== "cancelled"),
  }
}

/** Tri liste à préparer : non préparées d'abord, puis par prénom (fr). */
export function sortAPreparer(orders: SvcOrder[]): SvcOrder[] {
  return [...orders].sort((a, b) => {
    const pa = isPrepared(a) ? 1 : 0
    const pb = isPrepared(b) ? 1 : 0
    if (pa !== pb) return pa - pb
    return (a.child_prenom || "").localeCompare(b.child_prenom || "", "fr")
  })
}

// ── Compteurs d'en-tête (§2/§10) ────────────────────────────────────────────

export interface HeaderCounts {
  aPreparer: number
  aEncaisser: number
  caCents: number
  bubbleTea: number
}

export function headerCounts(orders: SvcOrder[]): HeaderCounts {
  const real = orders.filter((o) => !o.is_test)
  const prod = real.filter(isProduction)
  return {
    aPreparer: prod.length,
    aEncaisser: real.filter(isToCollect).length,
    // CA = paid uniquement, jamais les annulées (isPaid impose status==='paid').
    caCents: real.filter(isPaid).reduce((s, o) => s + (o.total_cents || 0), 0),
    bubbleTea: prod.reduce(
      (s, o) => s + o.items.filter(isBubbleTea).reduce((n, it) => n + (it.qty || 1), 0),
      0
    ),
  }
}

// ── Feuille de route : totaux par plat + boissons (§6) ───────────────────────

export interface RouteTotal {
  label: string
  qty: number
}
export interface RouteTotals {
  plats: RouteTotal[]     // menus + articles hors boisson, agrégés par libellé
  boissons: RouteTotal[]  // catégorie DRINK
}

function bump(map: Map<string, number>, label: string, qty: number) {
  map.set(label, (map.get(label) || 0) + qty)
}

/**
 * Totaux de production pour la feuille de route, sur les commandes à préparer
 * (hors comptes test). Un menu compte sous le nom de sa formule (« Menu Panda ») ;
 * un article seul sous son nom ; les boissons sont regroupées à part.
 */
export function routeTotals(orders: SvcOrder[]): RouteTotals {
  const plats = new Map<string, number>()
  const boissons = new Map<string, number>()

  for (const o of orders) {
    if (o.is_test || !isProduction(o)) continue
    for (const it of o.items) {
      const qty = it.qty || 1
      if (it.menu_formula_name) {
        bump(plats, it.menu_formula_name, qty)
      } else if (it.category_id === "DRINK" || isBubbleTea(it)) {
        bump(boissons, it.catalog_item_name || "Boisson", qty)
      } else if (it.catalog_item_name) {
        bump(plats, it.catalog_item_name, qty)
      }
    }
  }

  const toSorted = (m: Map<string, number>): RouteTotal[] =>
    [...m.entries()]
      .map(([label, qty]) => ({ label, qty }))
      .sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label, "fr"))

  return { plats: toSorted(plats), boissons: toSorted(boissons) }
}

// ── Options lisibles d'un article (piment, sans crudité, toppings) ───────────

export const SANS_CRUDITE = "sans crudité"

/**
 * Ligne d'affichage d'un item : nom + options entre parenthèses, telles qu'écrites
 * dans `notes` par /api/order-item. On renvoie aussi les options isolées pour pouvoir
 * les mettre en évidence côté UI (piment surtout).
 */
export function itemLine(it: SvcItem): { label: string; options: string[] } {
  const base = it.menu_formula_name || it.catalog_item_name || "Article"
  const notes = (it.notes || "").trim()
  const options: string[] = []
  if (/sauce\s*piment/i.test(notes)) options.push("🌶️ piment")
  if (new RegExp(SANS_CRUDITE, "i").test(notes)) options.push(SANS_CRUDITE)
  // Toppings entre parenthèses dans les notes : "Menu Panda — Thon (Tomates, Beurre)"
  const paren = notes.match(/\(([^)]+)\)/)
  if (paren) {
    for (const t of paren[1].split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!/piment/i.test(t)) options.push(t)
    }
  }
  return { label: base, options }
}
