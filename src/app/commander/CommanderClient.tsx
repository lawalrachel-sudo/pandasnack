"use client"

import { useMemo, useState } from "react"
import { Navbar } from "@/components/Navbar"
import { ProductCard } from "@/components/ProductCard"
import { CartBar } from "@/components/CartBar"

// ============================================================================
// TYPES — alignés sur le schéma DB réel (post-migration v1_12a)
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
}

interface Props {
  account: Account
  profils: Profil[]
  wallet: Wallet | null
  categories: Category[]
  menuFormulas: MenuFormula[]
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

// ============================================================================
// COMPONENT
// ============================================================================

export function CommanderClient({ account, profils, wallet, categories, menuFormulas, slots }: Props) {
  const [selectedSlotId, setSelectedSlotId] = useState<string>(slots[0]?.id || "")
  const [selectedProfilId, setSelectedProfilId] = useState<string>("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)

  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === selectedSlotId) || null,
    [slots, selectedSlotId]
  )

  const isMorningSlot = !!selectedSlot?.morning_delivery
  const totalCents = cart.reduce((sum, item) => sum + item.priceCents, 0)

  // Active profils
  const activeProfils = useMemo(() => profils.filter((p) => p.active), [profils])

  // Selected profil (default = is_default, else first)
  const selectedProfil = useMemo(() => {
    if (selectedProfilId) {
      return activeProfils.find((p) => p.id === selectedProfilId) || activeProfils[0] || null
    }
    return activeProfils.find((p) => p.is_default) || activeProfils[0] || null
  }, [activeProfils, selectedProfilId])

  // Set initial profil on first render
  useMemo(() => {
    if (!selectedProfilId && selectedProfil) {
      setSelectedProfilId(selectedProfil.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Maternelle detection
  const isSelectedMaternelle = selectedProfil?.classe === "maternelle"
  const hasAnyMaternelle = activeProfils.some((p) => p.classe === "maternelle")

  // Source group
  const sourceGroup = account.source_group
  const sourceDetail = account.source_detail

  // ============================================================================
  // CATALOGUE FILTERING
  // ============================================================================

  function itemVisibleForSlot(item: CatalogItem): boolean {
    if (!item.active) return false
    if (!item.sellable_alone) return false
    if (isMorningSlot && item.morning_available === false) return false

    const sku = item.sku || ""

    // École : masquer croques, BBL, salades
    if (sourceGroup === "ecole") {
      if (sku.startsWith("CROQ-")) return false
      if (sku === "DRINK-BBL") return false
      if (sku.startsWith("SAL-")) return false
      if (sourceDetail === "fond_lahaye" && sku === "SAND-C") return false
    }

    // Pandattitude : masquer salades
    if (sourceGroup === "pandattitude") {
      if (sku.startsWith("SAL-")) return false
    }

    return true
  }

  // Séparer les snacks gourmands
  const { regularCategories, snackItems } = useMemo(() => {
    const snacks: CatalogItem[] = []
    const regulars: Category[] = []

    for (const cat of categories) {
      const visibleItems = (cat.catalog_items || []).filter(itemVisibleForSlot)
      const inSnack = visibleItems.filter((i) => i.ui_group === "snack_gourmand")
      const notSnack = visibleItems.filter((i) => i.ui_group !== "snack_gourmand")

      snacks.push(...inSnack)
      if (notSnack.length > 0) {
        regulars.push({ ...cat, catalog_items: notSnack })
      }
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

      // BENTO_TOUPITI : seulement si au moins un profil maternelle + école
      if (code === "BENTO_TOUPITI") {
        if (sourceGroup !== "ecole") return false
        return hasAnyMaternelle
      }

      // BENTO_PANDA : école + pandattitude
      if (code === "BENTO_PANDA") {
        return sourceGroup === "ecole" || sourceGroup === "pandattitude"
      }

      // MENU_PANDA : pandattitude only
      if (code.startsWith("MENU_PANDA")) {
        return sourceGroup === "pandattitude"
      }

      // COFFRET : panda_guest only
      if (code.startsWith("COFFRET")) {
        return sourceGroup === "panda_guest"
      }

      return true
    })
  }, [menuFormulas, sourceGroup, hasAnyMaternelle])

  // ============================================================================
  // CART ACTIONS
  // ============================================================================

  function addCatalogItemToCart(itemId: string) {
    const item = categories
      .flatMap((c) => c.catalog_items)
      .find((i) => i.id === itemId)
    if (!item || !item.sellable_alone || item.price_alone_cents == null) return

    const profil = selectedProfil
    const newItem: CartItem = {
      itemId: item.id,
      itemName: item.name,
      priceCents: item.price_alone_cents,
      profilId: profil?.id ?? null,
      profilPrenom: profil?.prenom ?? account.nom_compte,
      isTakeaway: false,
      isFormula: false,
    }
    setCart((prev) => [...prev, newItem])
  }

  function addFormulaToCart(formulaId: string) {
    const formula = menuFormulas.find((f) => f.id === formulaId)
    if (!formula) return

    const profil = selectedProfil
    const newItem: CartItem = {
      itemId: formula.id,
      itemName: formula.name,
      priceCents: formula.price_cents,
      profilId: profil?.id ?? null,
      profilPrenom: profil?.prenom ?? account.nom_compte,
      isTakeaway: false,
      isFormula: true,
    }
    setCart((prev) => [...prev, newItem])
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index))
  }

  function toggleTakeaway(index: number) {
    setCart((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, isTakeaway: !item.isTakeaway } : item
      )
    )
  }

  function changeProfilForItem(index: number, profilId: string) {
    const target = activeProfils.find((p) => p.id === profilId)
    if (!target) return
    setCart((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, profilId: target.id, profilPrenom: target.prenom }
          : item
      )
    )
  }

  // Wallet logic (SPEC section 7.3)
  const walletBalance = wallet?.balance_cents ?? 0
  const walletCoversTotal = walletBalance >= totalCents && walletBalance > 0
  const walletPartial = walletBalance > 0 && walletBalance < totalCents

  // Maternelle = bento only → catalogue masqué sauf snacks
  const showCatalogue = !(isSelectedMaternelle && sourceGroup === "ecole")

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen pb-20 max-w-lg mx-auto">
      <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} />

      {/* Hero banner */}
      <div
        className="px-4 py-6 text-center"
        style={{
          background: "linear-gradient(135deg, var(--menu-panda-start), var(--menu-panda-end))",
        }}
      >
        <img
          src="https://res.cloudinary.com/dbkpvp9ts/image/upload/w_400,q_auto,f_auto/v1776298625/BANNIERE_panda_snack_logo.png"
          alt="Panda Snack"
          className="mx-auto max-w-[280px] mb-3"
        />
      </div>

      {/* Profil selector — BEFORE catalogue (SPEC: "Le parent sélectionne un profil enfant") */}
      {activeProfils.length > 1 && (
        <div className="px-4 pt-4">
          <h2 className="font-bold text-sm mb-2" style={{ color: "var(--ink-soft)" }}>
            Commande pour
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {activeProfils.map((p) => {
              const isSelected = selectedProfil?.id === p.id
              const classeLabel = p.classe
                ? ({ maternelle: "Mat.", primaire: "Prim.", college: "Coll.", lycee: "Lyc.", prof: "Prof" } as Record<string, string>)[p.classe]
                : null
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedProfilId(p.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap border transition-colors ${
                    isSelected ? "text-white border-transparent" : "border-[var(--border)]"
                  }`}
                  style={isSelected ? { background: "var(--accent)" } : {}}
                >
                  {p.prenom}
                  {classeLabel && (
                    <span className="ml-1 opacity-75 text-xs">({classeLabel})</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Single profil display */}
      {activeProfils.length === 1 && selectedProfil && (
        <div className="px-4 pt-3">
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Commande pour <strong style={{ color: "var(--ink)" }}>{selectedProfil.prenom}</strong>
            {selectedProfil.classe && (
              <span className="ml-1 text-xs">
                ({({ maternelle: "Maternelle", primaire: "Primaire", college: "Collège", lycee: "Lycée", prof: "Prof/Équipe" } as Record<string, string>)[selectedProfil.classe]})
              </span>
            )}
          </p>
        </div>
      )}

      {/* Slot selector */}
      <div className="px-4 py-4">
        <h2 className="font-bold text-sm mb-2" style={{ color: "var(--ink-soft)" }}>
          Jour de livraison
        </h2>
        {slots.length === 0 ? (
          <div
            className="rounded-xl p-4 text-sm"
            style={{ background: "var(--bg-alt)", color: "var(--ink-soft)" }}
          >
            Aucun créneau ouvert pour le moment. Reviens bientôt.
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {slots.map((slot) => {
              const isSelected = selectedSlotId === slot.id
              return (
                <button
                  key={slot.id}
                  onClick={() => setSelectedSlotId(slot.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap border transition-colors ${
                    isSelected ? "text-white border-transparent" : "border-[var(--border)]"
                  }`}
                  style={isSelected ? { background: "var(--accent)" } : {}}
                >
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

      {/* Maternelle lock message */}
      {isSelectedMaternelle && sourceGroup === "ecole" && (
        <div
          className="mx-4 mb-4 rounded-xl p-4 text-sm"
          style={{ background: "#FEF3E2", border: "1px solid #F5D5A0", color: "var(--ink)" }}
        >
          <strong>{selectedProfil?.prenom}</strong> est en maternelle — le repas est un{" "}
          <strong>Bento du jour</strong> (pas de swap sandwich/pasta).
          Tu peux ajouter des snacks en plus.
        </div>
      )}

      {/* ================================================================ */}
      {/* MENUS & FORMULES                                                  */}
      {/* ================================================================ */}
      {visibleFormulas.length > 0 && (
        <div className="px-4 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-bold text-lg">Menus & Formules</h2>
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--accent-2)" }}>
            Chaque menu est servi avec un thé maison offert.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {visibleFormulas.map((formula) => {
              const placeholder = "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776343219/etiquette_emballage.png"
              return (
                <div
                  key={formula.id}
                  className="rounded-2xl overflow-hidden cursor-pointer transition-transform hover:scale-[1.02]"
                  style={{ background: "var(--card)", boxShadow: "0 2px 12px var(--shadow)" }}
                  onClick={() => addFormulaToCart(formula.id)}
                >
                  <div className="aspect-[4/3] overflow-hidden">
                    {formula.image_url ? (
                      <img
                        src={formula.image_url}
                        alt={formula.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ background: "var(--bg-alt)" }}
                      >
                        <img
                          src={placeholder}
                          alt={formula.name}
                          className="w-20 h-20 object-contain opacity-60"
                        />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h4 className="font-semibold text-sm">{formula.name}</h4>
                    {formula.description && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                        {formula.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="font-bold text-base">{formatPrice(formula.price_cents)}</span>
                      <span
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                        style={{ background: "var(--accent)" }}
                      >
                        Ajouter +
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
      {showCatalogue && (
        <div className="px-4 space-y-8">
          {regularCategories.map((category) => (
            <section key={category.id}>
              <div className="flex items-center gap-2 mb-3">
                {category.emoji && <span className="text-xl">{category.emoji}</span>}
                <h2 className="font-bold text-lg">{category.name}</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {category.catalog_items
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((item) => (
                    <ProductCard
                      key={item.id}
                      id={item.id}
                      name={item.name}
                      description={item.description}
                      priceCents={item.price_alone_cents}
                      imageUrl={item.image_url}
                      emoji={item.emoji}
                      isMenuOnly={!item.sellable_alone && item.sellable_in_menu}
                      allergens={item.allergens}
                      onSelect={addCatalogItemToCart}
                    />
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Snacks gourmands — toujours visibles (même maternelle) */}
      {snackItems.length > 0 && (
        <div className="px-4 mt-8">
          <section>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-bold text-lg">Un petit en-cas ?</h2>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
              Ajoute un snack pour {selectedProfil?.prenom ?? "toi"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {snackItems.map((item) => (
                <ProductCard
                  key={item.id}
                  id={item.id}
                  name={item.name}
                  description={item.description}
                  priceCents={item.price_alone_cents}
                  imageUrl={item.image_url}
                  emoji={item.emoji}
                  isMenuOnly={!item.sellable_alone && item.sellable_in_menu}
                  allergens={item.allergens}
                  onSelect={addCatalogItemToCart}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ================================================================ */}
      {/* CART MODAL                                                        */}
      {/* ================================================================ */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div
            className="w-full max-w-lg rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto"
            style={{ background: "var(--card)" }}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Mon panier</h3>
              <button
                onClick={() => setShowCart(false)}
                className="text-2xl leading-none"
                aria-label="Fermer"
              >
                &times;
              </button>
            </div>

            {cart.length === 0 ? (
              <p style={{ color: "var(--ink-soft)" }}>Ton panier est vide.</p>
            ) : (
              <div className="space-y-3">
                {cart.map((item, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-xl border"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{item.itemName}</p>

                        {/* Profil reassign in cart */}
                        {activeProfils.length > 1 ? (
                          <select
                            value={item.profilId ?? ""}
                            onChange={(e) => changeProfilForItem(index, e.target.value)}
                            className="mt-1 text-xs rounded-md border px-2 py-1 w-full"
                            style={{
                              borderColor: "var(--border)",
                              background: "var(--bg-alt)",
                            }}
                          >
                            {activeProfils.map((p) => (
                              <option key={p.id} value={p.id}>
                                Pour {p.prenom}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                            Pour : {item.profilPrenom}
                          </p>
                        )}

                        <label className="flex items-center gap-2 mt-2 text-xs">
                          <input
                            type="checkbox"
                            checked={item.isTakeaway}
                            onChange={() => toggleTakeaway(index)}
                          />
                          A emporter
                        </label>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-sm">{formatPrice(item.priceCents)}</p>
                        <button
                          onClick={() => removeFromCart(index)}
                          className="text-xs underline mt-1"
                          style={{ color: "var(--accent)" }}
                        >
                          Retirer
                        </button>
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

                {/* Wallet logic — SPEC 7.3 */}
                {walletCoversTotal ? (
                  <button
                    className="w-full h-12 rounded-xl font-semibold text-white"
                    style={{ background: "var(--accent-2)" }}
                  >
                    Payer avec Pass Panda ({formatPrice(walletBalance)})
                  </button>
                ) : walletPartial ? (
                  <div className="space-y-2">
                    <button
                      className="w-full h-12 rounded-xl font-semibold text-white"
                      style={{ background: "var(--accent-2)" }}
                    >
                      Wallet ({formatPrice(walletBalance)}) + CB ({formatPrice(totalCents - walletBalance)})
                    </button>
                    <button
                      className="w-full h-12 rounded-xl font-semibold text-white"
                      style={{ background: "var(--accent)" }}
                    >
                      Entièrement par carte
                    </button>
                  </div>
                ) : (
                  <button
                    className="w-full h-12 rounded-xl font-semibold text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    Payer par carte
                  </button>
                )}

                {!selectedSlot && (
                  <p className="text-xs text-center" style={{ color: "var(--accent)" }}>
                    Sélectionne un créneau de livraison
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <CartBar
        itemCount={cart.length}
        totalCents={totalCents}
        onOpen={() => setShowCart(true)}
      />
    </div>
  )
}
