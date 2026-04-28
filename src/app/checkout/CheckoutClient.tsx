"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Navbar } from "@/components/Navbar"

// ============================================================================
// TYPES
// ============================================================================

interface OrderItem {
  id: string
  catalog_item_id: string | null
  menu_formula_id: string | null
  formula_choices: { plat_sku?: string; toppings?: string[] } | null
  topping_ids: string[] | null
  quantity: number
  unit_price_cents: number
  line_total_cents: number
  takeaway: boolean
  profil_id: string | null
  prenom_libre: string | null
  notes: string
  profils: { id: string; prenom: string; classe: string | null } | null
}

interface Order {
  id: string
  order_number: string
  status: string
  subtotal_cents: number
  vat_rate: number
  vat_cents: number
  total_cents: number
  payment_method: string
  special_request: string | null
  created_at: string
  service_slots: {
    id: string
    service_date: string
    day_type: string
    orders_cutoff_at: string | null
    delivery_points: { id: string; name: string; address: string | null; delivery_time_local: string | null } | null
  }
}

interface Wallet {
  id: string
  balance_cents: number
  last_recharge_cents: number | null
}

interface Account {
  id: string
  nom_compte: string
  source_group: string | null
}

interface Props {
  order: Order
  items: OrderItem[]
  wallet: Wallet | null
  account: Account
  pendingCount: number
  cutoffPassed: boolean
  wasCancelled: boolean
  toppingsMap: Record<string, string>
}

// ============================================================================
// HELPERS
// ============================================================================

const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776714727/PANDA_WALLET.jpg"

function fmtPrice(c: number): string {
  return `${(c / 100).toFixed(2).replace(".", ",")} €`
}

function fmtDate(d: string): string {
  const dt = new Date(d + "T12:00:00")
  const wd = dt.toLocaleDateString("fr-FR", { weekday: "long" })
  const dm = dt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CheckoutClient({ order, items, wallet, account, cutoffPassed, wasCancelled, toppingsMap, pendingCount }: Props) {
  const router = useRouter()
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelDismissed, setCancelDismissed] = useState(false)

  // --- Wallet logic ---
  const wb = wallet?.balance_cents ?? 0
  const wCovers = wb >= order.total_cents && wb > 0
  const wPartial = wb > 0 && wb < order.total_cents
  const cardAmount = wPartial ? order.total_cents - wb : order.total_cents

  // --- Group items by profil — distinct key per (profil_id | prenom_libre) ---
  const groupedItems = useMemo(() => {
    const groups: Record<string, { prenom: string; items: OrderItem[] }> = {}
    for (const item of items) {
      // Distinct key avoids merging different prenom_libre under one "__libre__"
      const key = item.profil_id
        ? `p:${item.profil_id}`
        : `l:${item.prenom_libre || "anon"}`
      const prenom = item.profils?.prenom || item.prenom_libre || "—"
      if (!groups[key]) groups[key] = { prenom, items: [] }
      groups[key].items.push(item)
    }
    return Object.values(groups)
  }, [items])

  // --- Delivery info ---
  const serviceDate = order.service_slots?.service_date
  const deliveryName = order.service_slots?.delivery_points?.name
  const deliveryTime = order.service_slots?.delivery_points?.delivery_time_local

  // --- Wallet tier label ---
  const tierLabel = useMemo(() => {
    const lrc = wallet?.last_recharge_cents ?? 0
    if (lrc >= 10000) return "Palier 100 € · -20%"
    if (lrc >= 5000) return "Palier 50 € · -10%"
    return null
  }, [wallet])

  // --- Resolve topping names for an item ---
  function getToppingNames(item: OrderItem): string[] {
    if (!Array.isArray(item.topping_ids) || item.topping_ids.length === 0) return []
    return item.topping_ids
      .map((tid) => toppingsMap[tid])
      .filter((n): n is string => Boolean(n))
  }

  // --- Handle payment ---
  async function handlePay(method: "wallet" | "card" | "wallet_card") {
    if (paymentLoading) return // belt-and-braces against double-click
    setPaymentLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/checkout-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          paymentMethod: method,
        }),
      })

      const data = await res.json()
      if (data.success && data.redirect) {
        if (data.redirect.startsWith("http")) {
          window.location.href = data.redirect
        } else {
          router.push(data.redirect)
        }
      } else {
        setError(data.error || "Erreur lors du paiement")
        setPaymentLoading(false)
      }
    } catch {
      setError("Erreur réseau. Réessaie.")
      setPaymentLoading(false)
    }
  }

  // --- Cutoff passed (terminal screen) ---
  if (cutoffPassed) {
    return (
      <div className="min-h-screen max-w-lg mx-auto px-4 py-8">
        <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} pendingCount={pendingCount} />
        <div className="text-center mt-16">
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: "var(--ink)" }}>
            Heure limite dépassée
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
            {`La commande pour le ${serviceDate ? fmtDate(serviceDate) : "ce jour"} ne peut plus être payée. L'heure limite était hier à 20h.`}
          </p>
          <Link href="/commander"
            className="inline-block px-6 py-3 rounded-xl text-white font-semibold"
            style={{ background: "var(--accent)" }}>
            Retour au menu
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 pb-8">
      <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} pendingCount={pendingCount} />

      {/* Cancellation banner (after Stripe cancel_url) */}
      {wasCancelled && !cancelDismissed && (
        <div className="rounded-xl p-3 mt-4 mb-2 flex items-start gap-2" style={{ background: "#FFF3E0", border: "1px solid #F59E0B" }}>
          <span className="text-lg leading-none">ℹ️</span>
          <div className="flex-1 text-xs" style={{ color: "#92400E" }}>
            <strong>Paiement annulé.</strong> Aucun montant n&apos;a été prélevé. Tu peux réessayer ci-dessous.
          </div>
          <button onClick={() => setCancelDismissed(true)} className="text-sm font-bold leading-none" style={{ color: "#92400E" }} aria-label="Fermer">
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="pt-4 pb-4">
        <button onClick={() => router.back()} className="text-sm flex items-center gap-1 mb-3" style={{ color: "var(--ink-soft)" }}>
          ← Retour au panier
        </button>
        <h1 className="text-xl font-bold" style={{ color: "var(--ink)" }}>
          Récapitulatif de commande
        </h1>
        <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
          Commande n° {order.order_number}
        </p>
      </div>

      {/* Delivery info */}
      {serviceDate && (
        <div className="rounded-xl p-4 mb-4" style={{ background: "var(--bg-alt)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            📅 {fmtDate(serviceDate)}
          </p>
          {deliveryName && (
            <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
              📍 {deliveryName}
              {deliveryTime && ` · ${deliveryTime}`}
            </p>
          )}
        </div>
      )}

      {/* Items grouped by profil */}
      <div className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-bold text-sm mb-3" style={{ color: "var(--ink)" }}>
          Articles commandés
        </h2>

        {groupedItems.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-4 pt-3 border-t" : ""} style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "var(--accent)" }}>
              🧒 {group.prenom}
            </p>
            <div className="space-y-2">
              {group.items.map((item) => {
                const toppingNames = getToppingNames(item)
                return (
                  <div key={item.id} className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{item.notes}</p>
                      {toppingNames.length > 0 && (
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
                          + {toppingNames.join(", ")}
                        </p>
                      )}
                      <div className="flex gap-2 mt-0.5 flex-wrap">
                        {item.takeaway && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--bg-alt)", color: "var(--ink-soft)" }}>
                            À emporter
                          </span>
                        )}
                        {item.quantity > 1 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--bg-alt)", color: "var(--ink-soft)" }}>
                            ×{item.quantity}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm font-semibold shrink-0">{fmtPrice(item.line_total_cents)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Special request */}
      {order.special_request && (
        <div className="rounded-xl border p-3 mb-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--ink-soft)" }}>
          📝 <strong>Note :</strong> {order.special_request}
        </div>
      )}

      {/* Promo code (placeholder v1 — disabled) */}
      <div className="rounded-xl border p-3 mb-4" style={{ borderColor: "var(--border)" }}>
        <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Code promo</label>
        <div className="flex gap-2 mt-1">
          <input
            type="text"
            placeholder="Bientôt disponible"
            disabled
            className="flex-1 px-3 py-2 rounded-lg border text-sm opacity-50"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
          />
          <button disabled className="px-4 py-2 rounded-lg text-sm font-medium opacity-50"
            style={{ background: "var(--bg-alt)", color: "var(--ink-soft)" }}>
            Appliquer
          </button>
        </div>
      </div>

      {/* Price breakdown */}
      <div className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--border)" }}>
        <div className="space-y-2">
          <div className="flex justify-between text-sm" style={{ color: "var(--ink-soft)" }}>
            <span>Sous-total ({items.length} article{items.length > 1 ? "s" : ""})</span>
            <span>{fmtPrice(order.subtotal_cents)}</span>
          </div>
          <div className="flex justify-between text-sm" style={{ color: "var(--ink-soft)" }}>
            <span>TVA {order.vat_rate}%</span>
            <span>{fmtPrice(order.vat_cents)}</span>
          </div>
          <div className="flex justify-between font-bold text-lg pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <span>Total TTC</span>
            <span style={{ color: "var(--accent)" }}>{fmtPrice(order.total_cents)}</span>
          </div>
        </div>
      </div>

      {/* Wallet info */}
      {wallet && wb > 0 && (
        <div className="rounded-xl p-4 mb-4 flex items-center gap-3" style={{ background: "#F0F7EC" }}>
          <img src={WALLET_IMG} alt="Panda Wallet" className="w-10 h-10 rounded-full object-cover shadow" />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "var(--accent-2)" }}>
              Panda Wallet : {fmtPrice(wb)}
            </p>
            {tierLabel && (
              <p className="text-[10px] mt-0.5" style={{ color: "var(--ink-soft)" }}>{tierLabel}</p>
            )}
            {wCovers && (
              <p className="text-xs mt-0.5" style={{ color: "var(--accent-2)" }}>
                ✅ Solde suffisant · Reste après paiement : {fmtPrice(wb - order.total_cents)}
              </p>
            )}
            {wPartial && (
              <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                Reste à payer par carte : {fmtPrice(cardAmount)} · Solde wallet après : 0,00 €
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl p-3 mb-4 text-sm font-medium" style={{ background: "#FEE2E2", color: "#DC2626" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Payment buttons */}
      <div className="space-y-3 mt-2">
        {paymentLoading ? (
          <div className="w-full h-14 rounded-xl flex items-center justify-center font-semibold"
            style={{ background: "var(--bg-alt)", color: "var(--ink-soft)" }}>
            <svg className="animate-spin mr-2 h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Paiement en cours...
          </div>
        ) : (
          <>
            {wCovers ? (
              <button onClick={() => handlePay("wallet")}
                className="w-full h-14 rounded-xl font-semibold text-white flex items-center justify-center gap-3 shadow-lg active:scale-[0.98] transition-transform"
                style={{ background: "var(--accent-2)" }}>
                <img src={WALLET_IMG} alt="" className="w-8 h-8 rounded-full object-cover" />
                Payer {fmtPrice(order.total_cents)} avec mon Wallet
              </button>
            ) : wPartial ? (
              <>
                <button onClick={() => handlePay("wallet_card")}
                  className="w-full h-14 rounded-xl font-semibold text-white flex items-center justify-center gap-3 shadow-lg active:scale-[0.98] transition-transform"
                  style={{ background: "var(--accent-2)" }}>
                  <img src={WALLET_IMG} alt="" className="w-8 h-8 rounded-full object-cover" />
                  Wallet ({fmtPrice(wb)}) + CB ({fmtPrice(cardAmount)})
                </button>
                <button onClick={() => handlePay("card")}
                  className="w-full h-12 rounded-xl font-semibold text-white active:scale-[0.98] transition-transform"
                  style={{ background: "var(--accent)" }}>
                  Tout par carte · {fmtPrice(order.total_cents)}
                </button>
              </>
            ) : (
              <button onClick={() => handlePay("card")}
                className="w-full h-14 rounded-xl font-semibold text-white shadow-lg active:scale-[0.98] transition-transform"
                style={{ background: "var(--accent)" }}>
                💳 Payer {fmtPrice(order.total_cents)} par carte
              </button>
            )}
          </>
        )}

        {/* Modifier / Retour */}
        <Link href="/commander"
          className="block w-full text-center py-3 rounded-xl text-sm font-medium border"
          style={{ borderColor: "var(--border)", color: "var(--ink-soft)" }}>
          ← Modifier ma commande
        </Link>
      </div>

      {/* Footer legal */}
      <p className="text-[10px] text-center mt-6 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        En payant, tu acceptes nos{" "}
        <Link href="/cgv" className="underline">CGV</Link> et{" "}
        <Link href="/cgu" className="underline">CGU</Link>.
        <br />TVA {order.vat_rate}% DOM Martinique.
      </p>
    </div>
  )
}
