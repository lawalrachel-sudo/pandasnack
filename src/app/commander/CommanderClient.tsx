"use client"

import { useMemo, useState } from "react"
import { Navbar } from "@/components/Navbar"
import { ProductCard } from "@/components/ProductCard"
import { CartBar } from "@/components/CartBar"

// ============================================================================
// TYPES
// ============================================================================

type SourceGroup = "ecole" | "pandattitude" | "panda_guest"
type Classe = "maternelle" | "primaire" | "college" | "lycee" | "prof"

interface CatalogItem {
  id: string
  sku: string | null
  code: string | null
  name: string
  description: string | null
  emoji: string | null
  price_alone_cents: number | null
  sellable_alone: boolean
  sellable_in_menu: boolean
  active: boolean
  sort_order: number
  allergens: string[] | null
  morning_available: boolean | null
  image_url: string | null
  ui_group: string | null
  category_id: string
}

interface Category {
  id: string
  name: string
  emoji: string | null
  sort_order: number
  morning_available: boolean | null
  catalog_items: CatalogItem[]
}

interface MenuFormula {
  id: string
  code: string
  name: string
  description: string | null
  price_cents: number
  image_url: string | null
  emoji: string | null
  active: boolean
  sort_order: number
}

interface Topping {
  id: string
  name: string
  emoji: string | null
  active: boolean
  sort_order: number
  applies_to_category_ids: string[] | null
}

interface Profil {
  id: string
  account_id: string
  prenom: string
  classe: Classe | null
  is_default: boolean
  active: boolean
  notes_allergies: string | null
}

interface Account {
  id: string
  nom_compte: string
  email: string
  source_group: SourceGroup | null
  source_detail: string | null
}

interface Wallet {
  balance_cents: number
}

interface DeliveryPoint {
  id: string
  name: string
  address: string | null
  delivery_time_local: string | null
}

interface Slot {
  id: string
  service_date: string
  day_type: string
  active: boolean
  morning_delivery: boolean | null
  target_source_group: SourceGroup | null
  delivery_points: DeliveryPoint | null
}

interface CartItem {
  itemId: string
  itemName: string
  priceCents: number
  profilId: string | null
  profilPrenom: string
  isTakeaway: boolean
  isFormula: boolean
  formulaCode: string | null
  selectedPlat: string | null
  selectedToppings: string[]
}

interface Props {
  account: Account
  profils: Profil[]
  wallet: Wallet | null
  categories: Category[]
  menuFormulas: MenuFormula[]
  toppings: Topping[]
  slots: Slot[]
}

// ============================================================================
// HELPERS
// ============================================================================

function formatSlotDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  const weekday = d.toLocaleDateString("fr-FR", { weekday: "short" })
  const dayMonth = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
  const wd = weekday.charAt(0).toUpperCase() + weekday.slice(1).replace(".", "")
  return `${wd} ${dayMonth}`
}

function formatPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`
}

// SKU prefix → topping category key
function skuToToppingCat(sku: string): string | null {
  if (sku.startsWith("SAND-")) return "SAND"
  if (sku.startsWith("CROQ-")) return "CROQ"
  if (sku.startsWith("SAL-")) return "SAL"
  if (sku.startsWith("PASTA-")) return "PASTA"
  return null
}

const CLASSE_LABELS: Record<string, string> = {
  maternelle: "Mat.",
  primaire: "Prim.",
  college: "Coll.",
  lycee: "Lyc.",
  prof: "Prof",
}

const CLASSE_LABELS_FULL: Record<string, string> = {
  maternelle: "Maternelle",
  primaire: "Primaire",
  college: "Collège",
  lycee: "Lycée",
  prof: "Prof/Équipe",
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CommanderClient({ account, profils, wallet, categories, menuFormulas, toppings, slots }: Props) {
  const [selectedSlotId, setSelectedSlotId] = useState<string>(slots[0]?.id || "")
  const [selectedProfilId, setSelectedProfilId] = useState<string>("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)

  // Menu Panda flow state
  const [menuFlowOpen, setMenuFlowOpen] = useState(false)
  const [menuFlowFormula, setMenuFlowFormula] = useState<MenuFormula | null>(null)
  const [menuFlowStep, setMenuFlowStep] = useState<"plat" | "garnitures" | "upsell">("plat")
  const [menuFlowPlat, setMenuFlowPlat] = useState<CatalogItem | null>(null)
  const [menuFlowToppings, setMenuFlowToppings] = useState<string[]>([])

  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === selectedSlotId) || null,
    [slots, selectedSlotId]
  )

  const isMorningSlot = !!selectedSlot?.morning_delivery
  const totalCents = cart.reduce((sum, item) => sum + item.priceCents, 0)

  const activeProfils = useMemo(() => profils.filter((p) => p.active), [profils])

  const selectedProfil = useMemo(() => {
    if (selectedProfilId) {
      return activeProfils.find((p) => p.id === selectedProfilId) || activeProfils[0] || null
    }
    return activeProfils.find((p) => p.is_default) || activeProfils[0] || null
  }, [activeProfils, selectedProfilId])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => { if (!selectedProfilId && selectedProfil) setSelectedProfilId(selectedProfil.id) }, [])

  const isSelectedMaternelle = selectedProfil?.classe === "maternelle"
  const hasAnyMaternelle = activeProfils.some((p) => p.classe === "maternelle")
  const sourceGroup = account.source_group
  const sourceDetail = account.source_detail

  // ============================================================================
  // CATALOGUE FILTERING
  // ============================================================================

  function itemVisibleForSource(item: CatalogItem): boolean {
    if (!item.active) return false
    const sku = item.sku || ""
    if (sourceGroup === "ecole") {
      if (sku.startsWith("CROQ-")) return false
      if (sku === "DRINK-BBL") return false
      if (sku.startsWith("SAL-")) return false
      if (sourceDetail === "fond_lahaye" && sku === "SAND-C") return false
    }
    if (sourceGroup === "pandattitude") {
      if (sku.startsWith("SAL-")) return false
    }
    return true
  }

  function itemVisibleForSlot(item: CatalogItem): boolean {
    if (!itemVisibleForSource(item)) return false
    if (!item.sellable_alone) return false
    if (isMorningSlot && item.morning_available === false) return false
    return true
  }

  // Items vendables en menu (pour le flow Menu Panda)
  const menuPlatItems = useMemo(() => {
    return categories
      .flatMap((c) => c.catalog_items)
      .filter((item) => item.active && item.sellable_in_menu && itemVisibleForSource(item))
      // Exclure les desserts/boissons du choix plat — garder sandwichs, pasta, croques, salades
      .filter((item) => {
        const sku = item.sku || ""
        return (
          sku.startsWith("SAND-") ||
          sku.startsWith("PASTA-") ||
          sku.startsWith("CROQ-") ||
          sku.startsWith("SAL-")
        )
      })
      .sort((a, b) => a.sort_order - b.sort_order)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, sourceGroup, sourceDetail])

  const { regularCategories, snackItems } = useMemo(() => {
    const snacks: CatalogItem[] = []
    const regulars: Category[] = []
    for (const cat of categories) {
      const visibleItems = (cat.catalog_items || []).filter(itemVisibleForSlot)
      const inSnack = visibleItems.filter((i) => i.ui_group === "snack_gourmand")
      const notSnack = visibleItems.filter((i) => i.ui_group !== "snack_gourmand")
      snacks.push(...inSnack)
      if (notSnack.length > 0) regulars.push({ ...cat, catalog_items: notSnack })
    }
    regulars.sort((a, b) => a.sort_order - b.sort_order)
    snacks.sort((a, b) => a.sort_order - b.sort_order)
    return { regularCategories: regulars, snackItems: snacks }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, isMorningSlot, sourceGroup, sourceDetail])

  // ============================================================================
  // MENU FORMULAS FILTERING
  // ============================================================================

  const visibleFormulas = useMemo(() => {
    return menuFormulas.filter((f) => {
      const code = f.code || ""
      if (code === "BENTO_TOUPITI") {
        return sourceGroup === "ecole" && hasAnyMaternelle
      }
      if (code === "BENTO_PANDA") {
        return sourceGroup === "ecole" || sourceGroup === "pandattitude"
      }
      if (code === "MENU_PANDA") {
        return sourceGroup === "ecole" || sourceGroup === "pandattitude"
      }
      // Guest = freeze
      if (code.startsWith("COFFRET")) return false
      return false
    })
  }, [menuFormulas, sourceGroup, hasAnyMaternelle])

  // Toppings for current plat
  const toppingsForPlat = useMemo(() => {
    if (!menuFlowPlat) return []
    const cat = skuToToppingCat(menuFlowPlat.sku || "")
    if (!cat) return []
    return toppings.filter((t) => {
      if (!t.applies_to_category_ids) return true
      return t.applies_to_category_ids.includes(cat)
    })
  }, [menuFlowPlat, toppings])

  const platNeedsToppings = toppingsForPlat.length > 0

  // ============================================================================
  // MENU FLOW ACTIONS
  // ============================================================================

  function openMenuFlow(formula: MenuFormula) {
    // Bento = direct add, no plat choice
    if (formula.code === "BENTO_PANDA" || formula.code === "BENTO_TOUPITI") {
      addFormulaDirectToCart(formula)
      return
    }
    setMenuFlowFormula(formula)
    setMenuFlowPlat(null)
    setMenuFlowToppings([])
    setMenuFlowStep("plat")
    setMenuFlowOpen(true)
  }

  function selectPlat(item: CatalogItem) {
    setMenuFlowPlat(item)
    // Check if this plat needs toppings
    const cat = skuToToppingCat(item.sku || "")
    const hasToppings = cat && toppings.some((t) => t.applies_to_category_ids?.includes(cat))
    if (hasToppings) {
      setMenuFlowToppings([])
      setMenuFlowStep("garnitures")
    } else {
      setMenuFlowStep("upsell")
    }
  }

  function toggleTopping(toppingId: string) {
    // "RIEN" = deselect all others
    const rienTopping = toppings.find((t) => t.name.startsWith("RIEN"))
    if (rienTopping && toppingId === rienTopping.id) {
      setMenuFlowToppings([toppingId])
      return
    }
    // Remove "RIEN" if selecting something else
    setMenuFlowToppings((prev) => {
      const without = prev.filter((id) => id !== rienTopping?.id)
      if (without.includes(toppingId)) {
        return without.filter((id) => id !== toppingId)
      }
      return [...without, toppingId]
    })
  }

  function confirmToppings() {
    setMenuFlowStep("upsell")
  }

  function addMenuToCart() {
    if (!menuFlowFormula || !menuFlowPlat) return
    const profil = selectedProfil
    const toppingNames = menuFlowToppings
      .map((id) => toppings.find((t) => t.id === id)?.name)
      .filter(Boolean)
    const platLabel = `${menuFlowFormula.name} — ${menuFlowPlat.name}${toppingNames.length > 0 ? ` (${toppingNames.join(", ")})` : ""}`

    const newItem: CartItem = {
      itemId: menuFlowFormula.id,
      itemName: platLabel,
      priceCents: menuFlowFormula.price_cents,
      profilId: profil?.id ?? null,
      profilPrenom: profil?.prenom ?? account.nom_compte,
      isTakeaway: false,
      isFormula: true,
      formulaCode: menuFlowFormula.code,
      selectedPlat: menuFlowPlat.sku,
      selectedToppings: menuFlowToppings,
    }
    setCart((prev) => [...prev, newItem])
    setMenuFlowOpen(false)
  }

  function addFormulaDirectToCart(formula: MenuFormula) {
    const profil = selectedProfil
    setCart((prev) => [
      ...prev,
      {
        itemId: formula.id,
        itemName: formula.name,
        priceCents: formula.price_cents,
        profilId: profil?.id ?? null,
        profilPrenom: profil?.prenom ?? account.nom_compte,
        isTakeaway: false,
        isFormula: true,
        formulaCode: formula.code,
        selectedPlat: null,
        selectedToppings: [],
      },
    ])
  }

  // ============================================================================
  // CART ACTIONS
  // ============================================================================

  function addCatalogItemToCart(itemId: string) {
    const item = categories.flatMap((c) => c.catalog_items).find((i) => i.id === itemId)
    if (!item || !item.sellable_alone || item.price_alone_cents == null) return
    const profil = selectedProfil
    setCart((prev) => [
      ...prev,
      {
        itemId: item.id,
        itemName: item.name,
        priceCents: item.price_alone_cents!,
        profilId: profil?.id ?? null,
        profilPrenom: profil?.prenom ?? account.nom_compte,
        isTakeaway: false,
        isFormula: false,
        formulaCode: null,
        selectedPlat: null,
        selectedToppings: [],
      },
    ])
  }

  function addUpsellFromFlow(itemId: string) {
    addCatalogItemToCart(itemId)
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index))
  }

  function toggleTakeaway(index: number) {
    setCart((prev) =>
      prev.map((item, i) => (i === index ? { ...item, isTakeaway: !item.isTakeaway } : item))
    )
  }

  function changeProfilForItem(index: number, profilId: string) {
    const target = activeProfils.find((p) => p.id === profilId)
    if (!target) return
    setCart((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, profilId: target.id, profilPrenom: target.prenom } : item
      )
    )
  }

  const walletBalance = wallet?.balance_cents ?? 0
  const walletCoversTotal = walletBalance >= totalCents && walletBalance > 0
  const walletPartial = walletBalance > 0 && walletBalance < totalCents
  const showCatalogue = !(isSelectedMaternelle && sourceGroup === "ecole")

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen pb-20 max-w-lg mx-auto">
      <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} />

      {/* Hero */}
      <div className="px-4 py-6 text-center" style={{ background: "linear-gradient(135deg, var(--menu-panda-start), var(--menu-panda-end))" }}>
        <img src="https://res.cloudinary.com/dbkpvp9ts/image/upload/w_400,q_auto,f_auto/v1776298625/BANNIERE_panda_snack_logo.png" alt="Panda Snack" className="mx-auto max-w-[280px] mb-3" />
      </div>

      {/* Profil selector */}
      {activeProfils.length > 1 && (
        <div className="px-4 pt-4">
          <h2 className="font-bold text-sm mb-2" style={{ color: "var(--ink-soft)" }}>Commande pour</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {activeProfils.map((p) => {
              const isSelected = selectedProfil?.id === p.id
              return (
                <button key={p.id} onClick={() => setSelectedProfilId(p.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap border transition-colors ${isSelected ? "text-white border-transparent" : "border-[var(--border)]"}`}
                  style={isSelected ? { background: "var(--accent)" } : {}}>
                  {p.prenom}
                  {p.classe && <span className="ml-1 opacity-75 text-xs">({CLASSE_LABELS[p.classe]})</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {activeProfils.length === 1 && selectedProfil && (
        <div className="px-4 pt-3">
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Commande pour <strong style={{ color: "var(--ink)" }}>{selectedProfil.prenom}</strong>
            {selectedProfil.classe && <span className="ml-1 text-xs">({CLASSE_LABELS_FULL[selectedProfil.classe]})</span>}
          </p>
        </div>
      )}

      {/* Slot selector */}
      <div className="px-4 py-4">
        <h2 className="font-bold text-sm mb-2" style={{ color: "var(--ink-soft)" }}>Jour de livraison</h2>
        {slots.length === 0 ? (
          <div className="rounded-xl p-4 text-sm" style={{ background: "var(--bg-alt)", color: "var(--ink-soft)" }}>
            Aucun créneau ouvert pour le moment. Reviens bientôt.
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {slots.map((slot) => {
              const isSelected = selectedSlotId === slot.id
              return (
                <button key={slot.id} onClick={() => setSelectedSlotId(slot.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap border transition-colors ${isSelected ? "text-white border-transparent" : "border-[var(--border)]"}`}
                  style={isSelected ? { background: "var(--accent)" } : {}}>
                  {formatSlotDate(slot.service_date)}
                </button>
              )
            })}
          </div>
        )}
        {selectedSlot && (
          <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
            {selectedSlot.morning_delivery ? "8h30-9h" : "Midi"}
            {selectedSlot.delivery_points?.name ? ` · ${selectedSlot.delivery_points.name}` : ""}
          </p>
        )}
      </div>

      {/* Maternelle lock */}
      {isSelectedMaternelle && sourceGroup === "ecole" && (
        <div className="mx-4 mb-4 rounded-xl p-4 text-sm" style={{ background: "#FEF3E2", border: "1px solid #F5D5A0" }}>
          <strong>{selectedProfil?.prenom}</strong> est en maternelle — le repas est un <strong>Bento du jour</strong> (pas de swap).
          Tu peux ajouter des snacks en plus.
        </div>
      )}

      {/* ================================================================ */}
      {/* MENUS & FORMULES                                                  */}
      {/* ================================================================ */}
      {visibleFormulas.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="font-bold text-lg mb-1">Menus & Formules</h2>
          <p className="text-xs mb-3" style={{ color: "var(--accent-2)" }}>Chaque menu est servi avec un thé maison offert.</p>
          <div className="grid grid-cols-2 gap-3">
            {visibleFormulas.map((formula) => {
              const placeholder = "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776343219/etiquette_emballage.png"
              return (
                <div key={formula.id} className="rounded-2xl overflow-hidden cursor-pointer transition-transform hover:scale-[1.02]"
                  style={{ background: "var(--card)", boxShadow: "0 2px 12px var(--shadow)" }}
                  onClick={() => openMenuFlow(formula)}>
                  <div className="aspect-[4/3] overflow-hidden">
                    {formula.image_url && !formula.image_url.includes("etiquette_emballage") ? (
                      <img src={formula.image_url} alt={formula.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl" style={{ background: "var(--bg-alt)" }}>
                        {formula.emoji || "🐼"}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h4 className="font-semibold text-sm">{formula.name}</h4>
                    {formula.description && <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>{formula.description}</p>}
                    <div className="flex items-center justify-between mt-2">
                      <span className="font-bold text-base">{formatPrice(formula.price_cents)}</span>
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--accent)" }}>
                        {formula.code.startsWith("BENTO") ? "Ajouter +" : "Composer"}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* CATALOGUE — articles seuls (masqué si maternelle école)           */}
      {/* ================================================================ */}
      {showCatalogue && regularCategories.length > 0 && (
        <div className="px-4 space-y-8">
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Ou commande un article seul :</p>
          {regularCategories.map((category) => (
            <section key={category.id}>
              <div className="flex items-center gap-2 mb-3">
                {category.emoji && <span className="text-xl">{category.emoji}</span>}
                <h2 className="font-bold text-lg">{category.name}</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {category.catalog_items.sort((a, b) => a.sort_order - b.sort_order).map((item) => (
                  <ProductCard key={item.id} id={item.id} name={item.name} description={item.description}
                    priceCents={item.price_alone_cents} imageUrl={item.image_url} emoji={item.emoji}
                    isMenuOnly={!item.sellable_alone && item.sellable_in_menu} allergens={item.allergens}
                    onSelect={addCatalogItemToCart} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Snacks — toujours visibles */}
      {snackItems.length > 0 && (
        <div className="px-4 mt-8">
          <h2 className="font-bold text-lg mb-1">Un petit en-cas ?</h2>
          <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>Ajoute un snack pour {selectedProfil?.prenom ?? "toi"}</p>
          <div className="grid grid-cols-2 gap-3">
            {snackItems.map((item) => (
              <ProductCard key={item.id} id={item.id} name={item.name} description={item.description}
                priceCents={item.price_alone_cents} imageUrl={item.image_url} emoji={item.emoji}
                isMenuOnly={false} allergens={item.allergens} onSelect={addCatalogItemToCart} />
            ))}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MENU PANDA FLOW MODAL                                             */}
      {/* ================================================================ */}
      {menuFlowOpen && menuFlowFormula && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="w-full max-w-lg rounded-t-2xl max-h-[85vh] overflow-y-auto" style={{ background: "var(--card)" }}>
            {/* Header */}
            <div className="sticky top-0 z-10 flex justify-between items-center px-5 py-4 border-b" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div>
                <h3 className="font-bold text-lg">{menuFlowFormula.name} — {formatPrice(menuFlowFormula.price_cents)}</h3>
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {menuFlowStep === "plat" && "Choisis ton plat"}
                  {menuFlowStep === "garnitures" && `Garnitures pour ${menuFlowPlat?.name}`}
                  {menuFlowStep === "upsell" && "Un petit extra ?"}
                </p>
              </div>
              <button onClick={() => setMenuFlowOpen(false)} className="text-2xl leading-none" aria-label="Fermer">&times;</button>
            </div>

            <div className="p-5">
              {/* STEP 1 : Choix du plat */}
              {menuFlowStep === "plat" && (
                <div className="grid grid-cols-2 gap-3">
                  {menuPlatItems.map((item) => (
                    <div key={item.id}
                      className="rounded-2xl overflow-hidden cursor-pointer transition-transform hover:scale-[1.02] border-2"
                      style={{ background: "var(--card)", borderColor: menuFlowPlat?.id === item.id ? "var(--accent)" : "transparent", boxShadow: "0 2px 12px var(--shadow)" }}
                      onClick={() => selectPlat(item)}>
                      <div className="aspect-[4/3] overflow-hidden">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-4xl" style={{ background: "var(--bg-alt)" }}>
                            {item.emoji || "🐼"}
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <h4 className="font-semibold text-sm text-center">{item.name}</h4>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* STEP 2 : Garnitures */}
              {menuFlowStep === "garnitures" && (
                <div>
                  <div className="space-y-2 mb-4">
                    {toppingsForPlat.map((t) => {
                      const isChecked = menuFlowToppings.includes(t.id)
                      return (
                        <label key={t.id}
                          className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors"
                          style={{ borderColor: isChecked ? "var(--accent)" : "var(--border)", background: isChecked ? "#FEF3E2" : "transparent" }}>
                          <input type="checkbox" checked={isChecked} onChange={() => toggleTopping(t.id)}
                            className="w-5 h-5 rounded" style={{ accentColor: "var(--accent)" }} />
                          <span className="text-lg">{t.emoji}</span>
                          <span className="text-sm font-medium">{t.name}</span>
                        </label>
                      )
                    })}
                  </div>
                  <button onClick={confirmToppings}
                    className="w-full h-12 rounded-xl font-semibold text-white"
                    style={{ background: "var(--accent)" }}>
                    {menuFlowToppings.length === 0 ? "Sans garniture" : "Valider les garnitures"}
                  </button>
                </div>
              )}

              {/* STEP 3 : Upsell */}
              {menuFlowStep === "upsell" && (
                <div>
                  {snackItems.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {snackItems.map((item) => (
                        <div key={item.id}
                          className="rounded-2xl overflow-hidden cursor-pointer transition-transform hover:scale-[1.02]"
                          style={{ background: "var(--card)", boxShadow: "0 2px 8px var(--shadow)" }}
                          onClick={() => addUpsellFromFlow(item.id)}>
                          <div className="aspect-[4/3] overflow-hidden">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-3xl" style={{ background: "var(--bg-alt)" }}>
                                {item.emoji || "🐼"}
                              </div>
                            )}
                          </div>
                          <div className="p-2">
                            <h4 className="font-semibold text-xs">{item.name}</h4>
                            <span className="text-xs font-bold">{item.price_alone_cents ? formatPrice(item.price_alone_cents) : ""}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={addMenuToCart}
                    className="w-full h-12 rounded-xl font-semibold text-white"
                    style={{ background: "var(--accent)" }}>
                    {snackItems.length > 0 ? "Ajouter mon menu au panier" : "Ajouter au panier"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* CART MODAL                                                        */}
      {/* ================================================================ */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="w-full max-w-lg rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto" style={{ background: "var(--card)" }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Mon panier</h3>
              <button onClick={() => setShowCart(false)} className="text-2xl leading-none" aria-label="Fermer">&times;</button>
            </div>

            {cart.length === 0 ? (
              <p style={{ color: "var(--ink-soft)" }}>Ton panier est vide.</p>
            ) : (
              <div className="space-y-3">
                {cart.map((item, index) => (
                  <div key={index} className="p-3 rounded-xl border" style={{ borderColor: "var(--border)" }}>
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{item.itemName}</p>
                        {activeProfils.length > 1 ? (
                          <select value={item.profilId ?? ""} onChange={(e) => changeProfilForItem(index, e.target.value)}
                            className="mt-1 text-xs rounded-md border px-2 py-1 w-full"
                            style={{ borderColor: "var(--border)", background: "var(--bg-alt)" }}>
                            {activeProfils.map((p) => (
                              <option key={p.id} value={p.id}>Pour {p.prenom}</option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>Pour : {item.profilPrenom}</p>
                        )}
                        <label className="flex items-center gap-2 mt-2 text-xs">
                          <input type="checkbox" checked={item.isTakeaway} onChange={() => toggleTakeaway(index)} />
                          A emporter
                        </label>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-sm">{formatPrice(item.priceCents)}</p>
                        <button onClick={() => removeFromCart(index)} className="text-xs underline mt-1" style={{ color: "var(--accent)" }}>Retirer</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{formatPrice(totalCents)}</span>
                </div>
                {walletCoversTotal ? (
                  <button className="w-full h-12 rounded-xl font-semibold text-white" style={{ background: "var(--accent-2)" }}>
                    Payer avec Pass Panda ({formatPrice(walletBalance)})
                  </button>
                ) : walletPartial ? (
                  <div className="space-y-2">
                    <button className="w-full h-12 rounded-xl font-semibold text-white" style={{ background: "var(--accent-2)" }}>
                      Wallet ({formatPrice(walletBalance)}) + CB ({formatPrice(totalCents - walletBalance)})
                    </button>
                    <button className="w-full h-12 rounded-xl font-semibold text-white" style={{ background: "var(--accent)" }}>
                      Entièrement par carte
                    </button>
                  </div>
                ) : (
                  <button className="w-full h-12 rounded-xl font-semibold text-white" style={{ background: "var(--accent)" }}>
                    Payer par carte
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <CartBar itemCount={cart.length} totalCents={totalCents} onOpen={() => setShowCart(true)} />
    </div>
  )
}
