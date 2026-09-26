import { describe, expect, it } from "vitest"
import {
  classifySections,
  composeItemLabel,
  headerCounts,
  isBubbleTea,
  isPaid,
  isProduction,
  isToCollect,
  itemLine,
  routeTotals,
  sortAPreparer,
  type SvcItem,
  type SvcOrder,
} from "./service-du-jour"

function item(p: Partial<SvcItem> = {}): SvcItem {
  return {
    notes: p.notes ?? null,
    menu_formula_name: p.menu_formula_name ?? null,
    catalog_item_name: p.catalog_item_name ?? null,
    catalog_item_sku: p.catalog_item_sku ?? null,
    category_id: p.category_id ?? null,
    qty: p.qty ?? 1,
  }
}

function order(p: Partial<SvcOrder> = {}): SvcOrder {
  return {
    id: p.id ?? "o1",
    order_number: p.order_number ?? "PS-1",
    status: p.status ?? "paid",
    payment_method: p.payment_method ?? "wallet_card",
    // `null` est une valeur voulue (pas encore encaissé) : ne pas l'écraser par ??.
    paid_at: "paid_at" in p ? p.paid_at! : "2026-09-25T10:00:00Z",
    payment_mode: p.payment_mode ?? null,
    prepared_at: p.prepared_at ?? null,
    total_cents: p.total_cents ?? 1000,
    special_request: p.special_request ?? null,
    created_at: p.created_at ?? "2026-09-24T10:00:00Z",
    is_test: p.is_test ?? false,
    child_prenom: p.child_prenom ?? "Sofia",
    child_classe: p.child_classe ?? "mercredi",
    notes_allergies: p.notes_allergies ?? null,
    parent_nom: p.parent_nom ?? "Parent",
    parent_telephone: p.parent_telephone ?? null,
    items: p.items ?? [item()],
  }
}

const paid = order({ id: "paid", status: "paid", payment_method: "wallet_card", total_cents: 1000 })
const onSiteAEncaisser = order({ id: "os", status: "pending_payment", payment_method: "on_site", paid_at: null, total_cents: 1500 })
const onSiteEncaisse = order({ id: "ose", status: "paid", payment_method: "on_site", paid_at: "x", total_cents: 1500 })
const brouillon = order({ id: "draft", status: "pending_payment", payment_method: "draft", paid_at: null, total_cents: 2000 })
// Régression PS-05 : annulée avec paid_at renseigné — ne doit JAMAIS compter ni « encaissée ».
const annuleePayee = order({ id: "cxl", status: "cancelled", payment_method: "on_site", paid_at: "2026-09-24T18:55:49Z", total_cents: 1500 })
const testAccount = order({ id: "t", status: "paid", is_test: true, total_cents: 9999 })

describe("prédicats", () => {
  it("isProduction : payée ou sur place, jamais annulée", () => {
    expect(isProduction(paid)).toBe(true)
    expect(isProduction(onSiteAEncaisser)).toBe(true)
    expect(isProduction(brouillon)).toBe(false)
    expect(isProduction(annuleePayee)).toBe(false)
  })
  it("isToCollect : sur place non encaissé, jamais annulée", () => {
    expect(isToCollect(onSiteAEncaisser)).toBe(true)
    expect(isToCollect(onSiteEncaisse)).toBe(false)
    expect(isToCollect(paid)).toBe(false)
    expect(isToCollect(annuleePayee)).toBe(false) // paid_at pourtant renseigné
  })
  it("isPaid : le statut prime sur paid_at", () => {
    expect(isPaid(paid)).toBe(true)
    expect(isPaid(annuleePayee)).toBe(false)
    expect(isPaid(onSiteAEncaisser)).toBe(false)
  })
})

describe("headerCounts", () => {
  it("compte à préparer / à encaisser / CA sur commandes réelles", () => {
    const c = headerCounts([paid, onSiteAEncaisser, onSiteEncaisse, brouillon, annuleePayee])
    expect(c.aPreparer).toBe(3)              // paid + onSiteAEncaisser + onSiteEncaisse
    expect(c.aEncaisser).toBe(1)             // onSiteAEncaisser
    expect(c.caCents).toBe(1000 + 1500)      // paid + onSiteEncaisse ; annulée exclue
  })
  it("exclut totalement les comptes test", () => {
    const c = headerCounts([paid, testAccount])
    expect(c.aPreparer).toBe(1)
    expect(c.caCents).toBe(1000)
  })
  it("ne compte jamais l'annulée même avec paid_at (régression PS-05)", () => {
    const c = headerCounts([annuleePayee])
    expect(c.aPreparer).toBe(0)
    expect(c.aEncaisser).toBe(0)
    expect(c.caCents).toBe(0)
  })
  it("compteur Bubble Tea sur la production", () => {
    const withBbl = order({
      id: "b", status: "paid",
      items: [item({ menu_formula_name: "Menu Panda" }), item({ catalog_item_sku: "DRINK-BBL", catalog_item_name: "Bubble Tea" })],
    })
    expect(headerCounts([withBbl]).bubbleTea).toBe(1)
  })
})

describe("classifySections", () => {
  it("répartit chaque commande dans la bonne section", () => {
    const s = classifySections([paid, onSiteAEncaisser, brouillon, annuleePayee, testAccount])
    expect(s.aPreparer.map((o) => o.id).sort()).toEqual(["os", "paid"])
    expect(s.nonPayees.map((o) => o.id)).toEqual(["draft"])
    expect(s.annulees.map((o) => o.id)).toEqual(["cxl"])
    expect(s.test.map((o) => o.id)).toEqual(["t"])
  })
  it("une annulée d'un compte test n'apparaît pas en section TEST", () => {
    const s = classifySections([order({ id: "tc", is_test: true, status: "cancelled" })])
    expect(s.test).toHaveLength(0)
  })
})

describe("sortAPreparer", () => {
  it("non préparées d'abord, puis par prénom", () => {
    const zoe = order({ id: "zoe", child_prenom: "Zoé", prepared_at: null })
    const anna = order({ id: "anna", child_prenom: "Anna", prepared_at: null })
    const bob = order({ id: "bob", child_prenom: "Bob", prepared_at: "2026-09-25T09:00:00Z" })
    const out = sortAPreparer([bob, zoe, anna])
    expect(out.map((o) => o.id)).toEqual(["anna", "zoe", "bob"])
  })
})

describe("routeTotals", () => {
  it("agrège menus, articles et boissons séparément, hors test et hors annulées", () => {
    const orders = [
      order({ id: "1", status: "paid", items: [item({ menu_formula_name: "Menu Panda" }), item({ catalog_item_sku: "DRINK-BBL", catalog_item_name: "Bubble Tea", category_id: "DRINK" })] }),
      order({ id: "2", status: "pending_payment", payment_method: "on_site", paid_at: null, items: [item({ menu_formula_name: "Menu Panda" })] }),
      order({ id: "3", status: "paid", items: [item({ catalog_item_name: "Croque simple (1, sans crudité)", category_id: "CROQ" })] }),
      order({ id: "cxl", status: "cancelled", items: [item({ menu_formula_name: "Menu Panda" })] }),
      order({ id: "t", is_test: true, items: [item({ menu_formula_name: "Menu Panda" })] }),
    ]
    const r = routeTotals(orders)
    expect(r.plats).toEqual([
      { label: "Menu Panda", qty: 2 },
      { label: "Croque simple (1, sans crudité)", qty: 1 },
    ])
    expect(r.boissons).toEqual([{ label: "Bubble Tea", qty: 1 }])
  })
})

describe("composeItemLabel (fonction commune étiquettes + cartes)", () => {
  it("Elyas : plat + piment", () => {
    const c = composeItemLabel({ formulaName: "Menu Panda", platName: "Pasta Box Bolognaise (bœuf)", toppingNames: ["Sauce piment"] })
    expect(c.text).toBe("Menu Panda — Pasta Box Bolognaise (bœuf) · 🌶 piment")
  })
  it("Sofia : piment en tête puis garnitures dans l'ordre", () => {
    const c = composeItemLabel({ formulaName: "Menu Panda", platName: "Thon Mayo", toppingNames: ["Carottes râpées", "Laitue", "Beurre", "Sauce piment"] })
    expect(c.text).toBe("Menu Panda — Thon Mayo · 🌶 piment, Carottes râpées, Laitue, Beurre")
  })
  it("Leïa : une seule garniture, pas de piment", () => {
    const c = composeItemLabel({ formulaName: "Menu Panda", platName: "Thon Mayo", toppingNames: ["Carottes râpées"] })
    expect(c.text).toBe("Menu Panda — Thon Mayo · Carottes râpées")
  })
  it("article seul sans option", () => {
    expect(composeItemLabel({ platName: "Croque simple" }).text).toBe("Croque simple")
  })
  it("hasSauce via drapeau (case à cocher) même sans topping piment", () => {
    const c = composeItemLabel({ formulaName: "Menu Panda", platName: "Thon Mayo", toppingNames: [], hasSauce: true })
    expect(c.options).toEqual(["🌶 piment"])
  })
})

describe("itemLine", () => {
  it("extrait l'option piment", () => {
    const l = itemLine(item({ menu_formula_name: "Menu Panda", notes: "Menu Panda — Thon Mayo\nSAUCE PIMENT" }))
    expect(l.label).toBe("Menu Panda")
    expect(l.options).toContain("🌶 piment")
  })
  it("extrait les toppings entre parenthèses sans dupliquer le piment", () => {
    const l = itemLine(item({ catalog_item_name: "Sandwich", notes: "Sandwich (Tomates, Laitue)" }))
    expect(l.options).toEqual(["Tomates", "Laitue"])
  })
  it("détecte sans crudité", () => {
    const l = itemLine(item({ catalog_item_name: "Croque", notes: "Croque simple (1, sans crudité)" }))
    expect(l.options).toContain("sans crudité")
  })
})

describe("isBubbleTea", () => {
  it("par sku ou par nom", () => {
    expect(isBubbleTea(item({ catalog_item_sku: "DRINK-BBL" }))).toBe(true)
    expect(isBubbleTea(item({ catalog_item_name: "Bubble Tea maison" }))).toBe(true)
    expect(isBubbleTea(item({ catalog_item_name: "Croque" }))).toBe(false)
  })
})
