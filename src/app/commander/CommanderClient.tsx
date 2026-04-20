"use client"

import { useMemo, useState } from "react"
import { Navbar } from "@/components/Navbar"
import { ProductCard } from "@/components/ProductCard"
import { CartBar } from "@/components/CartBar"

// ============================================================================
// TYPES — alignés sur le schéma DB réel (post-migration v1_10)
// ============================================================================

type SourceGroup = "pandattitude" | "coffret_bureau" | "divers"

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

interface Profil {
  id: string
  account_id: string
  prenom: string
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
}

interface Props {
  account: Account
  profils: Profil[]
  wallet: Wallet | null
  categories: Category[]
  slots: Slot[]
}

// ============================================================================
// HELPERS
// ============================================================================

function formatSlotDate(dateStr: string, morning: boolean): string {
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

export function CommanderClient({ account, profils, wallet, categories, slots }: Props) {
  const [selectedSlotId, setSelectedSlotId] = useState<string>(slots[0]?.id || "")
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)

  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === selectedSlotId) || null,
    [slots, selectedSlotId]
  )

  const isMorningSlot = !!selectedSlot?.morning_delivery
  const totalCents = cart.reduce((sum, item) => sum + item.priceCents, 0)

  // Filtrage items : actifs + (si créneau matin) morning_available ≠ false
  // Règle métier : en matin, croques + bubble tea cachés (DB: morning_available=false)
  function itemVisibleForSlot(item: CatalogItem): boolean {
    if (!item.active) return false
    if (!item.sellable_alone) return false
    if (isMorningSlot && item.morning_available === false) return false
    return true
  }

  // Séparer les snacks gourmands (ui_group = 'snack_gourmand')
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
  }, [categories, isMorningSlot])

  // Default profil = is_default OU premier profil actif OU null (commande pour soi)
  const defaultProfil: Profil | null = useMemo(() => {
    const actives = profils.filter((p) => p.active)
    return actives.find((p) => p.is_default) || actives[0] || null
  }, [profils])

  function handleSelectProduct(itemId: string) {
    const item = categories
      .flatMap((c) => c.catalog_items)
      .find((i) => i.id === itemId)
    if (!item) return
    if (!item.sellable_alone || item.price_alone_cents == null) return

    const newItem: CartItem = {
      itemId: item.id,
      itemName: item.name,
      priceCents: item.price_alone_cents,
      profilId: defaultProfil?.id ?? null,
      profilPrenom: defaultProfil?.prenom ?? account.nom_compte,
      isTakeaway: false,
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
    const target =
      profilId === ""
        ? { id: null, prenom: account.nom_compte }
        : profils.find((p) => p.id === profilId)
    if (!target) return
    setCart((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, profilId: target.id as string | null, profilPrenom: target.prenom }
          : item
      )
    )
  }

  return (
    <div className="min-h-screen pb-20 max-w-lg mx-auto">
      <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} />

      {/* Hero banner */}
      <div
        className="px-4 py-6 text-center"
        style={{
          background: `linear-gradient(135deg, var(--menu-panda-start), var(--menu-panda-end))`,
        }}
      >
        <img
          src="https://res.cloudinary.com/dbkpvp9ts/image/upload/w_400,q_auto,f_auto/v1776298625/BANNIERE_panda_snack_logo.png"
          alt="Panda Snack"
          className="mx-auto max-w-[280px] mb-3"
        />
      </div>

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
            Aucun créneau ouvert pour le moment. Reviens bientôt 🐼
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {slots.map((slot) => {
              const isSelected = selectedSlotId === slot.id
              const icon = slot.morning_delivery ? "🌅 " : ""
              return (
                <button
                  key={slot.id}
                  onClick={() => setSelectedSlotId(slot.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap border transition-colors ${
                    isSelected ? "text-white border-transparent" : "border-[var(--border)]"
                  }`}
                  style={isSelected ? { background: "var(--accent)" } : {}}
                >
                  {icon}
                  {formatSlotDate(slot.service_date, !!slot.morning_delivery)}
                </button>
              )
            })}
          </div>
        )}

        {selectedSlot && (
          <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
            {selectedSlot.morning_delivery ? "8h30-9h · " : ""}
            {selectedSlot.delivery_points?.name ?? "Livraison"}
          </p>
        )}
      </div>

      {/* Catalog — catégories normales */}
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
                    onSelect={handleSelectProduct}
                  />
                ))}
            </div>
          </section>
        ))}

        {/* Section snacks gourmands séparée */}
        {snackItems.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🍪</span>
              <h2 className="font-bold text-lg">Snacks gourmands</h2>
            </div>
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
                  onSelect={handleSelectProduct}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Cart modal */}
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

                        {/* Sélecteur profil si multi-profils */}
                        {profils.length > 1 ? (
                          <select
                            value={item.profilId ?? ""}
                            onChange={(e) => changeProfilForItem(index, e.target.value)}
                            className="mt-1 text-xs rounded-md border px-2 py-1 w-full"
                            style={{
                              borderColor: "var(--border)",
                              background: "var(--bg-alt)",
                            }}
                          >
                            {profils
                              .filter((p) => p.active)
                              .map((p) => (
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
                          À emporter
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

                {wallet && wallet.balance_cents >= totalCents ? (
                  <button
                    className="w-full h-12 rounded-xl font-semibold text-white"
                    style={{ background: "var(--accent-2)" }}
                  >
                    Payer avec Pass Panda ({formatPrice(wallet.balance_cents)})
                  </button>
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
                    ⚠️ Sélectionne un créneau de livraison
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
