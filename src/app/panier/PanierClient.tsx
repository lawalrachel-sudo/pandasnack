"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import Link from "next/link"
import { Navbar } from "@/components/Navbar"
import { HeaderMetier } from "@/components/HeaderMetier"
import { useCart } from "@/lib/cart-context"

const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776714727/PANDA_WALLET.jpg"
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending_payment: { label: "En attente", color: "#B45309", bg: "#FEF3E2", dot: "🟡" },
  paid: { label: "Payée", color: "#166534", bg: "#DCFCE7", dot: "🟢" },
  in_preparation: { label: "En préparation", color: "#9333EA", bg: "#F3E8FF", dot: "🟢" },
  ready: { label: "Prête", color: "#0E7490", bg: "#CFFAFE", dot: "🟢" },
  delivered: { label: "Livrée", color: "#6B7280", bg: "#F3F4F6", dot: "🟢" },
  cancelled: { label: "Annulée", color: "#DC2626", bg: "#FEE2E2", dot: "🔴" },
  refunded: { label: "Remboursée", color: "#DC2626", bg: "#FEE2E2", dot: "🔴" },
}

function fmtPrice(c: number): string { return `${(c / 100).toFixed(2).replace(".", ",")} €` }
function fmtDateLong(d: string): string {
  const dt = new Date(d + "T12:00:00")
  const wd = dt.toLocaleDateString("fr-FR", { weekday: "long" })
  const dm = dt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`
}

interface OrderItem {
  id: string; notes: string; quantity: number; unit_price_cents: number
  line_total_cents: number; takeaway: boolean; profil_id: string | null
  prenom_libre: string | null
  catalog_item_id: string | null
  menu_formula_id: string | null
  topping_ids: string[] | null
  catalog_items: { id: string; name: string; sku: string } | null
  menu_formulas: { id: string; name: string; code: string } | null
  profils: { prenom: string } | null
}

interface Topping { id: string; name: string; emoji?: string | null; applies_to_category_ids?: string[] | null }

interface Order {
  id: string; order_number: string; status: string; total_cents: number
  payment_method: string; created_at: string; paid_at: string | null
  special_request: string | null
  service_slots: { service_date: string; day_type: string; orders_cutoff_at: string | null; delivery_points: { name: string } | null }
  order_items: OrderItem[]
}

interface Profil { id: string; prenom: string; classe: string | null; metier: string; is_default: boolean; active: boolean }
interface Slot { id: string; service_date: string; day_type: string; orders_cutoff_at: string | null }
interface CatalogItem {
  id: string; sku: string | null; name: string; emoji: string | null; description?: string | null
  price_alone_cents: number | null; image_url: string | null; ui_group: string | null
  sellable_alone?: boolean; sellable_in_menu?: boolean; category_id?: string | null
}

interface Props {
  account: { id: string; nom_compte: string; source_group: string | null; source_detail?: string | null }
  profils: Profil[]
  orders: Order[]
  wallet: { balance_cents: number } | null
  upcomingSlots: Slot[]
  pendingCount: number
  catalogItems: CatalogItem[]
  toppings: Topping[]
}

// B-α-ter — visForSource dupliquée de CommanderClient pour filtrage plats par sg/sd
function isAllowedForMetier(sku: string, sg: string | null, sd: string | null | undefined): boolean {
  if (!sku) return false
  if (sku === "BENTO-TOUPITI-CARTE") return false
  if (sku === "SAND-VOLAILLE") return false
  if (sg === "ecole_la_patience") {
    if (sku.startsWith("CROQ-")) return false
    if (sku === "DRINK-BBL") return false
    if (sku.startsWith("SAL-")) return false
    if (sd === "fond_lahaye" && sku === "SAND-C") return false
    if (sd === "fond_lahaye" && sku === "SAND-A") return false
  }
  if (sg === "pandattitude") {
    if (sku.startsWith("SAL-")) return false
  }
  if (sg === "panda_guest") {
    if (sku.startsWith("SAL-")) return false
    if (sku === "DRINK-BBL") return false
  }
  return true
}

function skuPrefix(sku: string | null | undefined): string {
  return (sku || "").split("-")[0]
}

// B-β — date "aujourd'hui" en TZ America/Martinique au format YYYY-MM-DD
function todayMartinique(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Martinique",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date())
}

export function PanierClient({ account, profils, orders, wallet, upcomingSlots, pendingCount, catalogItems, toppings }: Props) {
  const { refreshPendingCount } = useCart()
  // POINT 6 — refresh badge cart au mount (retour Stripe peut laisser BottomNav stale)
  useEffect(() => { refreshPendingCount() }, [refreshPendingCount])
  // BUG C — filtrer profils par metier de la page (1 profil = 1 seul metier)
  const pageMetier = (() => {
    const sg = account.source_group
    if (sg === "ecole_la_patience") return "ecole"
    if (sg === "pandattitude") return "pandattitude"
    if (sg === "panda_guest") return "panda_guest"
    return "ecole"
  })()
  // Bug 2+3 — sur ecole/pandattitude, exclure le profil parent (classe NULL). panda_guest = tous.
  const profilsForMetier = useMemo(() => profils.filter(p => {
    if (p.metier !== pageMetier) return false
    if (pageMetier === "panda_guest") return true
    return !!p.classe
  }), [profils, pageMetier])
  const [selectedProfilId, setSelectedProfilId] = useState<string>("all")
  // B-β+γ — expand/collapse PAR JOUR (Bug 1 reintroduit chevron) + multi-sélection (Bug 2)
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
  const [payingMulti, setPayingMulti] = useState(false)

  function toggleCollapseDate(date: string) {
    setCollapsedDates(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date); else next.add(date)
      return next
    })
  }
  function toggleSelectOrder(orderId: string) {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId)
      return next
    })
  }
  const printRef = useRef<HTMLDivElement>(null)

  // H2.1 — modal "Ajouter un repas" à une commande pending
  const [addItemOrderId, setAddItemOrderId] = useState<string | null>(null)
  const [addItemProfilId, setAddItemProfilId] = useState<string>("")
  const [addItemTakeaway, setAddItemTakeaway] = useState(false)
  const [addItemSubmitting, setAddItemSubmitting] = useState(false)

  // B-α-ter (Brief 3-E) — édition INLINE pure dans la card pour formula+plat
  // 1 seul item éditable à la fois. Switch fluide : ouvrir B annule A automatiquement.
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editPlatSku, setEditPlatSku] = useState<string>("")
  const [editToppingIds, setEditToppingIds] = useState<string[]>([])
  const [editSubmitting, setEditSubmitting] = useState(false)

  function startEdit(item: OrderItem) {
    setEditingItemId(item.id)
    // Initial plat = celui actuellement choisi
    const currentSku = item.catalog_items?.sku || ""
    setEditPlatSku(currentSku)
    setEditToppingIds(item.topping_ids || [])
  }

  function cancelEdit() {
    setEditingItemId(null)
    setEditPlatSku("")
    setEditToppingIds([])
  }

  // Plats compatibles pour formula+plat : sellable_in_menu + visForSource(sg/sd) + même prefix catégorie que le plat actuel
  function getEditPlatOptions(item: OrderItem): CatalogItem[] {
    const currentSku = item.catalog_items?.sku || ""
    const currentPrefix = skuPrefix(currentSku)
    return catalogItems.filter(c => {
      if (!c.sku || !c.sellable_in_menu) return false
      if (skuPrefix(c.sku) !== currentPrefix) return false
      if (!isAllowedForMetier(c.sku, account.source_group, account.source_detail)) return false
      return true
    })
  }

  // Toppings cascadés selon le plat actuellement édité (catégorie SKU prefix)
  function getCascadeToppings(): Topping[] {
    const cat = skuPrefix(editPlatSku) || null
    return toppings.filter(t => {
      if (!t.applies_to_category_ids || t.applies_to_category_ids.length === 0) return true
      return cat ? t.applies_to_category_ids.includes(cat) : false
    })
  }

  function toggleEditTopping(tid: string) {
    setEditToppingIds(prev => prev.includes(tid) ? prev.filter(x => x !== tid) : [...prev, tid])
  }

  async function handleEditValidate() {
    if (!editingItemId || !editPlatSku) return
    setEditSubmitting(true)
    try {
      const res = await fetch("/api/order-item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderItemId: editingItemId,
          newSku: editPlatSku,
          selectedToppings: editToppingIds,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        // Refresh des données pour afficher le nouveau contenu — full reload car PanierClient n'a pas de state mutable
        window.location.reload()
      } else {
        alert(data.error || "Erreur modification")
        setEditSubmitting(false)
      }
    } catch {
      alert("Erreur réseau")
      setEditSubmitting(false)
    }
  }

  function openAddItem(order: Order) {
    setAddItemOrderId(order.id)
    // profil par défaut: celui du 1er item de la commande, sinon premier profil
    const firstItemProfilId = order.order_items?.find(i => i.profil_id)?.profil_id
    setAddItemProfilId(firstItemProfilId || profils[0]?.id || "")
    setAddItemTakeaway(false)
  }

  async function handleAddItem(item: CatalogItem) {
    if (!addItemOrderId || !item.price_alone_cents) return
    setAddItemSubmitting(true)
    try {
      const res = await fetch("/api/order-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: addItemOrderId,
          catalogItemId: item.id,
          profilId: addItemProfilId || null,
          takeaway: addItemTakeaway,
          notes: item.name,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setAddItemOrderId(null)
        window.location.reload()
      } else {
        alert(data.error || "Erreur ajout article")
        setAddItemSubmitting(false)
      }
    } catch {
      alert("Erreur réseau")
      setAddItemSubmitting(false)
    }
  }

  const calendarData = useMemo(() => {
    const targetProfils = selectedProfilId === "all" ? profilsForMetier : profilsForMetier.filter(p => p.id === selectedProfilId)
    return upcomingSlots.slice(0, 14).map(slot => {
      const profilStatuses = targetProfils.map(profil => {
        const matchingOrder = orders.find(o =>
          o.service_slots?.service_date === slot.service_date &&
          o.order_items?.some(item => item.profil_id === profil.id) &&
          o.status !== "cancelled" && o.status !== "refunded"
        )
        return { profil, hasOrder: !!matchingOrder, status: matchingOrder?.status || null }
      })
      return { slot, profilStatuses }
    })
  }, [upcomingSlots, orders, profils, selectedProfilId])

  // BUG 3 — /panier ne montre QUE les pending_payment (paid/cancelled/refunded disparaissent)
  const filteredOrders = useMemo(() => {
    const visible = orders.filter(o => o.status === "pending_payment")
    if (selectedProfilId === "all") return visible
    return visible.filter(o => o.order_items?.some(item => item.profil_id === selectedProfilId))
  }, [orders, selectedProfilId])

  // B-β — today MQ pour distinguer futurs/passés
  const todayMQ = useMemo(() => todayMartinique(), [])

  const groupedOrders = useMemo(() => {
    const groups: Record<string, Order[]> = {}
    for (const order of filteredOrders) {
      const date = order.service_slots?.service_date || "sans-date"
      if (!groups[date]) groups[date] = []
      groups[date].push(order)
    }
    // Tri B-β : futurs (>= today) croissant en haut, passés décroissant en bas
    return Object.entries(groups).sort(([a], [b]) => {
      const aIsFuture = a >= todayMQ
      const bIsFuture = b >= todayMQ
      if (aIsFuture && !bIsFuture) return -1
      if (!aIsFuture && bIsFuture) return 1
      if (aIsFuture && bIsFuture) return a.localeCompare(b)
      return b.localeCompare(a)
    })
  }, [filteredOrders, todayMQ])

  // B-β — smooth scroll depuis click calendar pill
  function scrollToDate(date: string) {
    const el = document.getElementById(`day-${date}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // POINT 4 — initial state : SEULEMENT pending FUTURS sont cochés (passés exclus du GRAND TOTAL)
  useEffect(() => {
    const initialSel = new Set<string>()
    const initialCollapsed = new Set<string>()
    for (const o of orders) {
      const sd = o.service_slots?.service_date
      const isPast = sd && sd < todayMQ
      if (o.status === "pending_payment" && !isPast) initialSel.add(o.id)
    }
    for (const [d] of groupedOrders) {
      if (d !== "sans-date" && d < todayMQ) initialCollapsed.add(d)
    }
    setSelectedOrderIds(initialSel)
    setCollapsedDates(initialCollapsed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // POINT 4 — GRAND TOTAL exclut les commandes périmées (cohérent avec /api/checkout-multi)
  const selectedSum = useMemo(() => {
    return orders
      .filter(o => {
        if (o.status !== "pending_payment") return false
        if (!selectedOrderIds.has(o.id)) return false
        const sd = o.service_slots?.service_date
        if (sd && sd < todayMQ) return false  // passé exclu
        return true
      })
      .reduce((s, o) => s + (o.total_cents || 0), 0)
  }, [orders, selectedOrderIds, todayMQ])

  // POINT 5 — handler "Retirer du panier" pour orders périmées
  async function handleRemoveExpired(orderId: string) {
    if (!confirm("Retirer cette commande périmée du panier ?")) return
    try {
      const res = await fetch("/api/cancel-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      })
      if (res.ok) window.location.reload()
      else {
        const data = await res.json()
        alert(data.error || "Erreur")
      }
    } catch {
      alert("Erreur réseau")
    }
  }

  // B-γ — handler paiement multi
  async function handlePayMulti() {
    if (selectedOrderIds.size === 0 || payingMulti) return
    setPayingMulti(true)
    try {
      const res = await fetch("/api/checkout-multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: Array.from(selectedOrderIds),
          paymentMethod: "wallet_card",
        }),
      })
      const data = await res.json()
      if (data.success && data.redirect) {
        if (data.redirect.startsWith("http")) {
          window.location.href = data.redirect
        } else {
          window.location.href = data.redirect
        }
      } else {
        alert(data.error || "Erreur lors du paiement")
        setPayingMulti(false)
      }
    } catch {
      alert("Erreur réseau")
      setPayingMulti(false)
    }
  }

  // POINT 7 — print direct via window.print() en s'appuyant sur le CSS @media print
  // injecté en bas de page (cache tout sauf #panier-print). Plus fiable mobile/Safari
  // que window.open + document.write (qui rendait souvent about:blank).
  function handlePrint() {
    window.print()
  }

  return (
    <div className="min-h-screen pb-20 max-w-lg mx-auto">
      <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} pendingCount={pendingCount} />
      <HeaderMetier sg={account.source_group} />

      <div className="px-4 pt-3">
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--ink)" }}>Mon panier</h1>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>Tes commandes en attente de paiement</p>
      </div>

      {profilsForMetier.length > 1 && (
        <div className="px-4 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setSelectedProfilId("all")}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap border transition-colors ${selectedProfilId === "all" ? "text-white border-transparent" : "border-[var(--border)]"}`}
              style={selectedProfilId === "all" ? { background: "var(--accent)" } : {}}>
              Tous
            </button>
            {profilsForMetier.map(p => {
              const sel = selectedProfilId === p.id
              return (
                <button key={p.id} onClick={() => setSelectedProfilId(p.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap border transition-colors ${sel ? "text-white border-transparent" : "border-[var(--border)]"}`}
                  style={sel ? { background: "var(--accent)" } : {}}>
                  {p.prenom}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* B-β — Calendrier compact : pills horizontales scrollables, 1 pill par date avec order pending */}
      {groupedOrders.length > 0 && (
        <div className="px-4 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {groupedOrders.map(([date]) => {
              if (date === "sans-date") return null
              const isPast = date < todayMQ
              const isToday = date === todayMQ
              const dt = new Date(date + "T12:00:00")
              const dayNum = dt.getDate()
              const dayName = dt.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")
              const monthName = dt.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")
              return (
                <button
                  key={date}
                  onClick={() => scrollToDate(date)}
                  className="flex-shrink-0 flex flex-col items-center min-w-[60px] py-2 px-2 rounded-xl border text-center transition-opacity"
                  style={{
                    borderColor: isPast ? "var(--border)" : isToday ? "var(--accent-2)" : "var(--accent)",
                    background: isPast ? "var(--bg-alt)" : isToday ? "#E8F5E9" : "rgba(200,90,60,0.08)",
                    opacity: isPast ? 0.5 : 1,
                  }}
                >
                  <span className="text-[10px] uppercase" style={{ color: "var(--ink-soft)" }}>{dayName}</span>
                  <span className="text-base font-bold" style={{ color: isPast ? "var(--ink-soft)" : "var(--ink)" }}>{dayNum}</span>
                  <span className="text-[9px] uppercase" style={{ color: "var(--ink-soft)" }}>{monthName}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* B-γ — GRAND TOTAL + bouton Payer mes N commandes (multi-checkout Stripe) */}
      {selectedOrderIds.size > 0 && (
        <div className="mx-4 mb-4 p-3 rounded-xl border-2 shadow-md" style={{ borderColor: "var(--accent)", background: "var(--card)" }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>
              GRAND TOTAL · {selectedOrderIds.size} cmd
            </span>
            <span className="text-lg font-bold" style={{ color: "var(--accent)" }}>{fmtPrice(selectedSum)}</span>
          </div>
          <button onClick={handlePayMulti} disabled={payingMulti}
            className="flex items-center justify-center w-full h-12 rounded-xl font-bold text-white shadow-lg active:scale-[0.98] transition-transform text-center px-3 disabled:opacity-50"
            style={{ background: "var(--accent)" }}>
            {payingMulti ? "Redirection..." : `💳 Payer mes ${selectedOrderIds.size} commande${selectedOrderIds.size > 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {wallet && (
        <div className="mx-4 mb-4 rounded-xl p-3 flex items-center gap-3" style={{ background: "var(--bg-alt)" }}>
          <img src={WALLET_IMG} alt="Wallet" className="w-10 h-10 rounded-full object-cover" />
          <div>
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Solde Panda Wallet</p>
            <p className="font-bold text-lg" style={{ color: "var(--accent-2)" }}>{fmtPrice(wallet.balance_cents)}</p>
          </div>
        </div>
      )}

      {groupedOrders.length > 0 && (
        <div className="px-4 mb-4">
          <button onClick={handlePrint} className="w-full h-10 rounded-xl text-sm font-semibold border"
            style={{ borderColor: "var(--border)", color: "var(--ink-soft)" }}>
            Imprimer / Telecharger PDF
          </button>
        </div>
      )}

      {groupedOrders.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-4xl mb-3">🐼</p>
          <p className="font-semibold" style={{ color: "var(--ink)" }}>Aucune commande</p>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Tes commandes apparaitront ici.</p>
          <Link href="/commander" className="inline-block mt-4 px-6 py-3 rounded-xl font-semibold text-white text-sm" style={{ background: "var(--accent)" }}>
            Ma commande
          </Link>
        </div>
      ) : (
        <div className="px-4 space-y-6">
          {groupedOrders.map(([date, dateOrders]) => {
            // B-β — détection passé + total date + groupage items par profil
            const isPast = date !== "sans-date" && date < todayMQ
            const dateTotal = dateOrders.reduce((s, o) => s + (o.total_cents || 0), 0)
            const isCollapsed = collapsedDates.has(date)
            // BUG 2 — checkbox par jour (= toggle de toutes les orders du jour)
            const dayOrderIds = dateOrders.map(o => o.id)
            const allDaySelected = !isPast && dayOrderIds.every(id => selectedOrderIds.has(id))
            return (
              <div key={date} id={`day-${date}`} className="scroll-mt-4">
                {/* Header date avec chevron + checkbox (BUG 1 + BUG 2) */}
                <div className="flex items-center gap-2 mb-1">
                  {!isPast && (
                    <input
                      type="checkbox"
                      checked={allDaySelected}
                      onChange={() => {
                        // toggle all orders du jour
                        setSelectedOrderIds(prev => {
                          const next = new Set(prev)
                          if (allDaySelected) {
                            dayOrderIds.forEach(id => next.delete(id))
                          } else {
                            dayOrderIds.forEach(id => next.add(id))
                          }
                          return next
                        })
                      }}
                      className="w-4 h-4"
                      style={{ accentColor: "var(--accent)" }}
                      aria-label={`Sélectionner ${date}`}
                    />
                  )}
                  <button
                    onClick={() => toggleCollapseDate(date)}
                    className="flex-1 flex items-center justify-between text-left"
                    aria-label={`Replier/déplier ${date}`}
                  >
                    <span className="font-bold text-sm" style={{ color: "var(--ink)" }}>
                      🗓️ {date !== "sans-date" ? fmtDateLong(date) : "Sans date"}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-sm" style={{ color: "var(--accent)" }}>{fmtPrice(dateTotal)}</span>
                      <span className="text-lg" style={{ color: "var(--ink-soft)" }}>{isCollapsed ? "▼" : "▲"}</span>
                    </span>
                  </button>
                </div>
                {/* Bandeau orange si jour passé (Brief B-β) */}
                {isPast && !isCollapsed && (
                  <div className="rounded-lg p-2 mb-2 text-xs font-semibold" style={{ background: "#FFF3E0", border: "1px solid #F5D5A0", color: "#92400E" }}>
                    ⚠️ Commande non payée à temps
                  </div>
                )}
              {!isCollapsed && (
              <div className="space-y-3" style={{ opacity: isPast ? 0.6 : 1 }}>
                {dateOrders.map(order => {
                  const canModify = !isPast && (order.status === "paid" || order.status === "pending_payment") && isBeforeCutoff(order.service_slots?.orders_cutoff_at)
                  const canCancel = canModify

                  // B-β — group items par profil (profil_id ou prenom_libre fallback)
                  const itemsByProfil: Record<string, { name: string; items: OrderItem[]; total: number }> = {}
                  for (const item of order.order_items || []) {
                    const key = item.profil_id || `__libre_${item.prenom_libre || "anon"}`
                    const name = item.profils?.prenom || item.prenom_libre || "—"
                    if (!itemsByProfil[key]) itemsByProfil[key] = { name, items: [], total: 0 }
                    itemsByProfil[key].items.push(item)
                    itemsByProfil[key].total += item.line_total_cents || 0
                  }
                  const profilGroups = Object.values(itemsByProfil)

                  return (
                    <div key={order.id} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                      {/* B-β — sous-blocs par profil dans la card */}
                      <div className="px-3 pt-3 pb-2 space-y-3">
                        {profilGroups.map((g, gi) => (
                          <div key={gi}>
                            <p className="text-xs font-bold uppercase tracking-wide mb-2 flex items-center justify-between" style={{ color: "var(--accent)" }}>
                              <span>🧒 {g.name}</span>
                              <span style={{ color: "var(--ink)" }}>{fmtPrice(g.total)}</span>
                            </p>
                            <div className="space-y-2 pl-2 border-l-2" style={{ borderColor: "var(--border)" }}>
                              {g.items.map(item => {
                                const lineModifiable = canModify
                                const formulaName = item.menu_formulas?.name
                                const platName = item.catalog_items?.name
                                const toppingNames = (item.topping_ids || [])
                                  .map(tid => toppings.find(t => t.id === tid)?.name)
                                  .filter((n): n is string => Boolean(n))
                                const hasFormula = !!item.menu_formula_id
                                const hasCatalog = !!item.catalog_item_id
                                const isEditable = lineModifiable && hasFormula && hasCatalog
                                const isEditing = editingItemId === item.id

                                if (isEditing) {
                                  const platOptions = getEditPlatOptions(item)
                                  const cascadeTops = getCascadeToppings()
                                  return (
                                    <div key={item.id} className="rounded-lg p-3 border-2" style={{ background: "var(--card)", borderColor: "var(--accent)" }}>
                                      <p className="text-xs font-bold mb-2" style={{ color: "var(--accent)" }}>
                                        ✏️ MODIFIER · {formulaName?.toUpperCase()}
                                      </p>
                                      <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Plat principal</label>
                                      <select value={editPlatSku} onChange={(e) => setEditPlatSku(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border text-sm mb-3"
                                        style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                                        {platOptions.length === 0 && <option value="">Aucune alternative compatible</option>}
                                        {platOptions.map(opt => (<option key={opt.id} value={opt.sku || ""}>{opt.name}</option>))}
                                      </select>
                                      {cascadeTops.length > 0 && (
                                        <div className="mb-3">
                                          <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Garnitures</label>
                                          <div className="space-y-1">
                                            {cascadeTops.map(t => {
                                              const checked = editToppingIds.includes(t.id)
                                              return (
                                                <label key={t.id} className="flex items-center gap-2 text-xs cursor-pointer">
                                                  <input type="checkbox" checked={checked} onChange={() => toggleEditTopping(t.id)} className="w-4 h-4" style={{ accentColor: "var(--accent)" }} />
                                                  <span>{t.emoji && `${t.emoji} `}{t.name}</span>
                                                </label>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      )}
                                      <p className="text-xs italic mb-3" style={{ color: "var(--ink-soft)" }}>
                                        + Boisson : infusion maison glacée du jour · Dessert : du jour
                                      </p>
                                      <div className="flex gap-2">
                                        <button onClick={cancelEdit} disabled={editSubmitting}
                                          className="flex-1 h-9 rounded-lg text-xs font-semibold border disabled:opacity-50"
                                          style={{ borderColor: "var(--border)", color: "var(--ink-soft)" }}>
                                          Annuler
                                        </button>
                                        <button onClick={handleEditValidate} disabled={editSubmitting || !editPlatSku}
                                          className="flex-1 h-9 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                                          style={{ background: "var(--accent)" }}>
                                          {editSubmitting ? "Enregistrement..." : "Valider"}
                                        </button>
                                      </div>
                                    </div>
                                  )
                                }

                                return (
                                  <div key={item.id} className="rounded-lg p-2" style={{ background: "var(--bg-alt)" }}>
                                    <div className="flex justify-between items-start gap-2">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">
                                          {hasFormula && hasCatalog && formulaName && platName ? (
                                            <><strong style={{ textTransform: "uppercase" }}>{formulaName}</strong><span> — {platName}</span></>
                                          ) : hasFormula && formulaName ? formulaName : platName ? platName : item.notes}
                                        </p>
                                        {toppingNames.length > 0 && (
                                          <p className="text-xs italic mt-0.5" style={{ color: "var(--ink-soft)" }}>+ {toppingNames.join(", ")}</p>
                                        )}
                                        {item.takeaway && (
                                          <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>· À emporter</p>
                                        )}
                                      </div>
                                      <span className="font-semibold text-sm shrink-0">{fmtPrice(item.line_total_cents)}</span>
                                    </div>
                                    {/* B-β — Modifier/Retirer masqués si jour passé */}
                                    {lineModifiable && (
                                      <div className="flex gap-2 mt-2">
                                        {isEditable && (
                                          <button onClick={() => startEdit(item)}
                                            className="flex-1 text-center px-3 py-1.5 rounded-md text-xs font-semibold border"
                                            style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--card)" }}
                                            title="Modifier le plat dans cette commande">
                                            ✏️ Modifier
                                          </button>
                                        )}
                                        <button onClick={() => handleDeleteItem(item.id)}
                                          className={`${isEditable ? "flex-1" : "w-full"} text-center px-3 py-1.5 rounded-md text-xs font-semibold text-white`}
                                          style={{ background: "#DC2626" }}>
                                          🗑️ Retirer
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {order.special_request && (
                        <div className="mx-3 mb-2 p-2 rounded-lg text-xs" style={{ background: "var(--bg-alt)" }}>
                          <strong>Note :</strong> {order.special_request}
                        </div>
                      )}

                      {/* B-β+γ — bouton "Payer cette commande" individuel SUPPRIMÉ — paiement via bouton groupé bottom */}
                      {/* "Ajouter un repas" : MASQUÉ si passé */}
                      {canModify && (
                        <div className="px-3 pb-3 border-t space-y-2 pt-3" style={{ borderColor: "var(--border)" }}>
                          <button onClick={() => openAddItem(order)}
                            className="flex items-center justify-center w-full h-10 rounded-lg text-sm font-semibold border"
                            style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--card)" }}>
                            Ajouter un repas
                          </button>
                        </div>
                      )}

                      {/* B-β — "Annuler toute la commande" MASQUÉ si passé */}
                      {canCancel && (
                        <div className="px-3 pb-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                          <button className="w-full h-9 rounded-lg text-xs font-semibold text-white" style={{ background: "#DC2626" }}
                            onClick={() => handleCancel(order.id)}>
                            Annuler toute la commande
                          </button>
                        </div>
                      )}

                      {/* POINT 5 — bouton "Retirer du panier" pour orders périmées (jamais payées) */}
                      {isPast && order.status === "pending_payment" && (
                        <div className="px-3 pb-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                          <button
                            className="w-full h-9 rounded-lg text-xs font-semibold text-white"
                            style={{ background: "#6B7280" }}
                            onClick={() => handleRemoveExpired(order.id)}
                          >
                            🗑️ Retirer du panier
                          </button>
                        </div>
                      )}

                    </div>
                  )
                })}
              </div>
              )}
              </div>
            )
          })}
        </div>
      )}

      {/* POINT 7 — section imprimable visible UNIQUEMENT en mode print via @media print
          (hide-on-print masque tout le reste, panier-print devient visible). */}
      <div ref={printRef} id="panier-print" className="panier-print">
        <div className="panier-print-header">
          <h1>Panda Snack — Mon panier</h1>
          <p>Compte&nbsp;: {account.nom_compte}</p>
          <p>pandasnack.online</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Enfant</th>
              <th>Commande</th>
              <th>Montant</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {groupedOrders.flatMap(([date, dateOrders]) =>
              dateOrders.flatMap(order => {
                const st = STATUS_LABELS[order.status] || STATUS_LABELS.pending_payment
                const isPaid = order.status === "paid" || order.status === "in_preparation" || order.status === "ready" || order.status === "delivered"
                return order.order_items?.map((item, idx) => (
                  <tr key={`${order.id}-${idx}`}>
                    <td>{date !== "sans-date" ? fmtDateLong(date) : ""}</td>
                    <td>{item.profils?.prenom || item.prenom_libre || ""}</td>
                    <td>{item.notes}{item.takeaway ? " (emporter)" : ""}</td>
                    <td>{fmtPrice(item.line_total_cents)}</td>
                    <td className={isPaid ? "paid" : "pending"}>
                      {isPaid ? "v" : "?"} {st.label} #{order.order_number}
                    </td>
                  </tr>
                )) || []
              })
            )}
          </tbody>
        </table>
      </div>
      {/* POINT 7 — CSS @media print : on cache tout le wrapper sauf #panier-print */}
      <style jsx global>{`
        .panier-print { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          #panier-print, #panier-print * { visibility: visible !important; }
          #panier-print { display: block !important; position: absolute; left: 0; top: 0; width: 100%; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #3A2A20; font-size: 12px; }
          #panier-print .panier-print-header { margin-bottom: 16px; border-bottom: 2px solid #C85A3C; padding-bottom: 12px; }
          #panier-print h1 { font-size: 18px; margin: 0 0 4px; }
          #panier-print p { color: #6B5742; font-size: 11px; margin: 2px 0; }
          #panier-print table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          #panier-print th { background: #F0E6D6; text-align: left; padding: 8px 6px; font-size: 11px; border-bottom: 2px solid #E8D6BF; }
          #panier-print td { padding: 6px; border-bottom: 1px solid #E8D6BF; font-size: 11px; }
          #panier-print .paid { color: #166534; }
          #panier-print .pending { color: #B45309; }
          @page { size: A4 portrait; margin: 15mm; }
        }
      `}</style>

      {/* T4 modal swap supprimé en B-α-ter (édition inline dans la card) */}

      {/* H2.1 — Modal Ajouter un repas à une commande pending */}
      {addItemOrderId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="w-full max-w-lg rounded-t-2xl max-h-[85vh] overflow-y-auto" style={{ background: "var(--card)" }}>
            <div className="sticky top-0 z-10 flex justify-between items-center px-5 py-4 border-b" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div>
                <h3 className="font-bold text-lg">Ajouter un repas</h3>
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Sélectionne un article à ajouter à la commande</p>
              </div>
              <button onClick={() => setAddItemOrderId(null)} className="text-2xl leading-none" aria-label="Fermer">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Profil */}
              {profils.length > 1 && (
                <div>
                  <label className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>Pour</label>
                  <select
                    value={addItemProfilId}
                    onChange={(e) => setAddItemProfilId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                  >
                    {profils.filter(p => p.active).map(p => (
                      <option key={p.id} value={p.id}>{p.prenom}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* À emporter */}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={addItemTakeaway} onChange={(e) => setAddItemTakeaway(e.target.checked)} />
                À emporter — hors établissement
              </label>

              {/* Liste articles à la carte */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: "var(--ink-soft)" }}>Articles à la carte</p>
                <div className="grid grid-cols-2 gap-3">
                  {catalogItems.filter(it => it.price_alone_cents != null).map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleAddItem(item)}
                      disabled={addItemSubmitting}
                      className="rounded-xl border p-3 text-left active:scale-[0.98] transition-transform disabled:opacity-50"
                      style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                      {item.image_url ? (
                        <div className="aspect-[4/3] overflow-hidden rounded-lg mb-2">
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ) : (
                        <div className="aspect-[4/3] flex items-center justify-center rounded-lg mb-2 text-3xl" style={{ background: "var(--bg-alt)" }}>
                          {item.emoji || "🐼"}
                        </div>
                      )}
                      <p className="text-sm font-semibold">{item.name}</p>
                      <p className="text-sm font-bold mt-1" style={{ color: "var(--accent)" }}>{fmtPrice(item.price_alone_cents!)}</p>
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-center" style={{ color: "var(--ink-soft)" }}>
                Pour ajouter un menu complet (Bento, Menu Panda), reviens sur <Link href="/commander" className="underline font-semibold" style={{ color: "var(--accent)" }}>Le Menu</Link>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function isBeforeCutoff(cutoffAt?: string | null): boolean {
  if (!cutoffAt) return false
  const cutoff = new Date(cutoffAt)
  return new Date() < cutoff
}

async function handleDeleteItem(itemId: string) {
  if (!confirm("Supprimer cet article de la commande ?")) return
  try {
    const res = await fetch(`/api/order-item?itemId=${itemId}`, { method: "DELETE" })
    const data = await res.json()
    if (data.success) {
      window.location.reload()
    } else {
      alert(data.error || "Impossible de supprimer cet article.")
    }
  } catch {
    alert("Erreur reseau.")
  }
}

async function handleCancel(orderId: string) {
  if (!confirm("Annuler cette commande ? Le wallet sera recredite si applicable.")) return

  try {
    const res = await fetch("/api/cancel-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    })
    if (res.ok) {
      window.location.reload()
    } else {
      alert("Impossible d'annuler cette commande. L'heure limite de commande est passee.")
    }
  } catch {
    alert("Erreur reseau.")
  }
}
