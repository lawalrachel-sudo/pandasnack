"use client"

import { useState } from "react"
import { Navbar } from "@/components/Navbar"
import { ProductCard } from "@/components/ProductCard"
import { CartBar } from "@/components/CartBar"

interface Category {
  id: string
  name: string
  emoji: string | null
  sort_order: number
  catalog_items: CatalogItem[]
}

interface CatalogItem {
  id: string
  name: string
  description: string | null
  price_cents: number
  image_url: string | null
  is_active: boolean
  is_menu_only: boolean
  is_snack: boolean
  allergens: Record<string, string> | null
  sort_order: number
}

interface Beneficiary {
  id: string
  first_name: string
  last_name: string | null
}

interface CartItem {
  itemId: string
  itemName: string
  priceCents: number
  beneficiaryId: string | null
  beneficiaryName: string
  isTakeaway: boolean
  customizations: Record<string, unknown>
}

interface Slot {
  id: string
  slot_date: string
  day_type: string
  is_open: boolean
}

interface Props {
  family: { id: string; name: string }
  beneficiaries: Beneficiary[]
  wallet: { balance_cents: number } | null
  categories: Category[]
  slots: Slot[]
}

const DAY_LABELS: Record<string, string> = {
  lundi: "Lundi", mardi: "Mardi", mercredi: "Mercredi",
  jeudi: "Jeudi", vendredi: "Vendredi"
}

export function CommanderClient({ family, beneficiaries, wallet, categories, slots }: Props) {
  const [selectedSlot, setSelectedSlot] = useState<string>(slots[0]?.id || "")
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)

  const totalCents = cart.reduce((sum, item) => sum + item.priceCents, 0)

  function handleSelectProduct(itemId: string) {
    // Find the item
    const item = categories
      .flatMap(c => c.catalog_items)
      .find(i => i.id === itemId)
    if (!item) return

    // For V1: direct add with default beneficiary
    const defaultBenef = beneficiaries[0]
    const newItem: CartItem = {
      itemId: item.id,
      itemName: item.name,
      priceCents: item.price_cents,
      beneficiaryId: defaultBenef?.id || null,
      beneficiaryName: defaultBenef?.first_name || "—",
      isTakeaway: false,
      customizations: {},
    }
    setCart(prev => [...prev, newItem])
  }

  function removeFromCart(index: number) {
    setCart(prev => prev.filter((_, i) => i !== index))
  }

  function toggleTakeaway(index: number) {
    setCart(prev => prev.map((item, i) =>
      i === index ? { ...item, isTakeaway: !item.isTakeaway } : item
    ))
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00")
    return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
  }

  return (
    <div className="min-h-screen pb-20">
      <Navbar
        walletBalance={wallet?.balance_cents}
        familyName={family.name}
      />

      {/* Hero banner */}
      <div
        className="px-4 py-6 text-center"
        style={{ background: `linear-gradient(135deg, var(--menu-panda-start), var(--menu-panda-end))` }}
      >
        <img
          src="https://res.cloudinary.com/dbkpvp9ts/image/upload/w_400,q_auto,f_auto/v1776298625/BANNIERE_panda_snack_logo.png"
          alt="Panda Snack"
          className="mx-auto max-w-[280px] mb-3"
        />
        <p className="text-white/90 text-sm">Commande le repas de tes enfants</p>
      </div>

      {/* Slot selector */}
      <div className="px-4 py-4">
        <h2 className="font-bold text-sm mb-2" style={{ color: 'var(--ink-soft)' }}>
          Jour de livraison
        </h2>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {slots.map(slot => (
            <button
              key={slot.id}
              onClick={() => setSelectedSlot(slot.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap border transition-colors ${
                selectedSlot === slot.id
                  ? "text-white border-transparent"
                  : "border-[var(--border)]"
              }`}
              style={selectedSlot === slot.id ? { background: 'var(--accent)' } : {}}
            >
              {formatDate(slot.slot_date)}
            </button>
          ))}
          {slots.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Aucun créneau ouvert pour le moment.
            </p>
          )}
        </div>
      </div>

      {/* Catalog by category */}
      <div className="px-4 space-y-8">
        {categories
          .filter(cat => cat.catalog_items.some(i => i.is_active && !i.is_snack))
          .map(category => (
            <section key={category.id}>
              <div className="flex items-center gap-2 mb-3">
                {category.emoji && <span className="text-xl">{category.emoji}</span>}
                <h2 className="font-bold text-lg">{category.name}</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {category.catalog_items
                  .filter(item => item.is_active && !item.is_snack)
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map(item => (
                    <ProductCard
                      key={item.id}
                      id={item.id}
                      name={item.name}
                      description={item.description}
                      price_cents={item.price_cents}
                      image_url={item.image_url}
                      is_menu_only={item.is_menu_only}
                      allergens={item.allergens as Record<string, string> | null}
                      onSelect={handleSelectProduct}
                    />
                  ))}
              </div>
            </section>
          ))}
      </div>

      {/* Cart modal */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div
            className="w-full max-w-lg rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto"
            style={{ background: 'var(--card)' }}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Mon panier</h3>
              <button onClick={() => setShowCart(false)} className="text-2xl leading-none">&times;</button>
            </div>

            {cart.length === 0 ? (
              <p style={{ color: 'var(--ink-soft)' }}>Ton panier est vide.</p>
            ) : (
              <div className="space-y-3">
                {cart.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-xl border"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{item.itemName}</p>
                      <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                        Pour : {item.beneficiaryName}
                      </p>
                      <label className="flex items-center gap-2 mt-1 text-xs">
                        <input
                          type="checkbox"
                          checked={item.isTakeaway}
                          onChange={() => toggleTakeaway(index)}
                        />
                        À emporter
                      </label>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">
                        {(item.priceCents / 100).toFixed(2).replace('.', ',')} €
                      </p>
                      <button
                        onClick={() => removeFromCart(index)}
                        className="text-xs underline mt-1"
                        style={{ color: 'var(--accent)' }}
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{(totalCents / 100).toFixed(2).replace('.', ',')} €</span>
                </div>

                {wallet && wallet.balance_cents >= totalCents ? (
                  <button
                    className="w-full h-12 rounded-xl font-semibold text-white"
                    style={{ background: 'var(--accent-2)' }}
                  >
                    Payer avec Pass Panda ({(wallet.balance_cents / 100).toFixed(2).replace('.', ',')} €)
                  </button>
                ) : (
                  <button
                    className="w-full h-12 rounded-xl font-semibold text-white"
                    style={{ background: 'var(--accent)' }}
                  >
                    Payer par carte
                  </button>
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
