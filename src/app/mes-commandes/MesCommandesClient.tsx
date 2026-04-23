"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Navbar } from "@/components/Navbar"

const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776714727/PANDA_WALLET.jpg"
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment: { label: "En attente", color: "#B45309", bg: "#FEF3E2" },
  paid: { label: "Confirmée", color: "#166534", bg: "#DCFCE7" },
  in_preparation: { label: "En préparation", color: "#9333EA", bg: "#F3E8FF" },
  ready: { label: "Prête", color: "#0E7490", bg: "#CFFAFE" },
  delivered: { label: "Livrée", color: "#6B7280", bg: "#F3F4F6" },
  cancelled: { label: "Annulée", color: "#DC2626", bg: "#FEE2E2" },
  refunded: { label: "Remboursée", color: "#DC2626", bg: "#FEE2E2" },
}

function fmtPrice(c: number): string { return `${(c / 100).toFixed(2).replace(".", ",")} €` }
function fmtDate(d: string): string {
  const dt = new Date(d + "T12:00:00")
  return dt.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
}
function fmtDateLong(d: string): string {
  const dt = new Date(d + "T12:00:00")
  const wd = dt.toLocaleDateString("fr-FR", { weekday: "long" })
  const dm = dt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`
}

interface OrderItem {
  id: string; notes: string; quantity: number; unit_price_cents: number
  line_total_cents: number; takeaway: boolean; profil_id: string | null
  prenom_libre: string | null; profils: { prenom: string } | null
}

interface Order {
  id: string; order_number: string; status: string; total_cents: number
  payment_method: string; created_at: string; paid_at: string | null
  service_slots: { service_date: string; day_type: string; delivery_points: { name: string } | null }
  order_items: OrderItem[]
}

interface Profil { id: string; prenom: string; classe: string | null; is_default: boolean; active: boolean }
interface Slot { id: string; service_date: string; day_type: string }

interface Props {
  account: { id: string; nom_compte: string }
  profils: Profil[]
  orders: Order[]
  wallet: { balance_cents: number } | null
  upcomingSlots: Slot[]
}

export function MesCommandesClient({ account, profils, orders, wallet, upcomingSlots }: Props) {
  const [selectedProfilId, setSelectedProfilId] = useState<string>("all")
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  // Mini calendrier : slots à venir × profils avec statut commande
  const calendarData = useMemo(() => {
    const targetProfils = selectedProfilId === "all" ? profils : profils.filter(p => p.id === selectedProfilId)
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

  // Filtrer commandes par profil
  const filteredOrders = useMemo(() => {
    if (selectedProfilId === "all") return orders
    return orders.filter(o => o.order_items?.some(item => item.profil_id === selectedProfilId))
  }, [orders, selectedProfilId])

  // Grouper par date de service
  const groupedOrders = useMemo(() => {
    const groups: Record<string, Order[]> = {}
    for (const order of filteredOrders) {
      const date = order.service_slots?.service_date || "sans-date"
      if (!groups[date]) groups[date] = []
      groups[date].push(order)
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [filteredOrders])

  return (
    <div className="min-h-screen pb-20 max-w-lg mx-auto">
      <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} />

      <div className="px-4 pt-6">
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--ink)" }}>Mes commandes</h1>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>60 derniers jours</p>
      </div>

      {/* Filtre profil */}
      {profils.length > 1 && (
        <div className="px-4 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setSelectedProfilId("all")}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap border transition-colors ${selectedProfilId === "all" ? "text-white border-transparent" : "border-[var(--border)]"}`}
              style={selectedProfilId === "all" ? { background: "var(--accent)" } : {}}>
              Tous
            </button>
            {profils.map(p => {
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

      {/* Mini calendrier */}
      {calendarData.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="font-bold text-sm mb-2" style={{ color: "var(--ink-soft)" }}>Prochains jours</h2>
          <div className="flex gap-1.5 overflow-x-auto pb-2">
            {calendarData.map(({ slot, profilStatuses }) => {
              const anyOrder = profilStatuses.some(ps => ps.hasOrder)
              const allOrdered = profilStatuses.every(ps => ps.hasOrder)
              const dt = new Date(slot.service_date + "T12:00:00")
              const dayNum = dt.getDate()
              const dayName = dt.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")

              return (
                <div key={slot.id} className="flex flex-col items-center min-w-[44px] py-2 px-1 rounded-xl border text-center"
                  style={{
                    borderColor: anyOrder ? "var(--accent-2)" : "var(--border)",
                    background: allOrdered ? "#E8F5E9" : anyOrder ? "#FEF3E2" : "transparent",
                  }}>
                  <span className="text-[10px] uppercase" style={{ color: "var(--ink-soft)" }}>{dayName}</span>
                  <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>{dayNum}</span>
                  <span className="text-xs mt-0.5">
                    {allOrdered ? "✅" : anyOrder ? "⏳" : "—"}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px]" style={{ color: "var(--ink-soft)" }}>
            <span>✅ commandé</span>
            <span>⏳ partiel</span>
            <span>— pas encore</span>
          </div>
        </div>
      )}

      {/* Wallet résumé */}
      {wallet && (
        <div className="mx-4 mb-4 rounded-xl p-3 flex items-center gap-3" style={{ background: "var(--bg-alt)" }}>
          <img src={WALLET_IMG} alt="Wallet" className="w-10 h-10 rounded-full object-cover" />
          <div>
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Solde Panda Wallet</p>
            <p className="font-bold text-lg" style={{ color: "var(--accent-2)" }}>{fmtPrice(wallet.balance_cents)}</p>
          </div>
        </div>
      )}

      {/* Liste commandes */}
      {groupedOrders.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-4xl mb-3">🐼</p>
          <p className="font-semibold" style={{ color: "var(--ink)" }}>Aucune commande</p>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Tes commandes apparaîtront ici.</p>
          <Link href="/commander" className="inline-block mt-4 px-6 py-3 rounded-xl font-semibold text-white text-sm" style={{ background: "var(--accent)" }}>
            Commander
          </Link>
        </div>
      ) : (
        <div className="px-4 space-y-4">
          {groupedOrders.map(([date, dateOrders]) => (
            <div key={date}>
              <h3 className="font-bold text-sm mb-2" style={{ color: "var(--ink)" }}>
                {date !== "sans-date" ? fmtDateLong(date) : "Sans date"}
              </h3>
              <div className="space-y-2">
                {dateOrders.map(order => {
                  const st = STATUS_LABELS[order.status] || STATUS_LABELS.pending_payment
                  const isExpanded = expandedOrder === order.id
                  const canModify = order.status === "paid" && isBeforeCutoff(order.service_slots?.service_date)
                  const canCancel = canModify

                  return (
                    <div key={order.id} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                      <button onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                        className="w-full p-3 flex items-center justify-between text-left">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.color }}>
                              {st.label}
                            </span>
                            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>#{order.order_number}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm font-semibold">{fmtPrice(order.total_cents)}</span>
                            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                              · {order.order_items?.length || 0} article(s)
                            </span>
                          </div>
                        </div>
                        <span className="text-lg" style={{ color: "var(--ink-soft)" }}>{isExpanded ? "▲" : "▼"}</span>
                      </button>

                      {isExpanded && (
                        <div className="px-3 pb-3 border-t" style={{ borderColor: "var(--border)" }}>
                          <div className="space-y-2 mt-2">
                            {order.order_items?.map(item => (
                              <div key={item.id} className="flex justify-between text-sm">
                                <div>
                                  <p>{item.notes}</p>
                                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                                    {item.profils?.prenom || item.prenom_libre}
                                    {item.takeaway ? " · À emporter" : ""}
                                  </p>
                                </div>
                                <span className="font-medium shrink-0">{fmtPrice(item.line_total_cents)}</span>
                              </div>
                            ))}
                          </div>

                          {(canModify || canCancel) && (
                            <div className="flex gap-2 mt-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                              {canModify && (
                                <button className="flex-1 h-9 rounded-lg text-xs font-semibold border" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                                  Modifier
                                </button>
                              )}
                              {canCancel && (
                                <button className="flex-1 h-9 rounded-lg text-xs font-semibold text-white" style={{ background: "#DC2626" }}
                                  onClick={() => handleCancel(order.id)}>
                                  Annuler
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bouton commander en bas */}
      <div className="px-4 mt-8">
        <Link href="/commander" className="block w-full h-12 rounded-xl font-semibold text-white text-center leading-[3rem]" style={{ background: "var(--accent)" }}>
          Nouvelle commande
        </Link>
      </div>
    </div>
  )
}

function isBeforeCutoff(serviceDate?: string): boolean {
  if (!serviceDate) return false
  // Cutoff = veille 20h Martinique (UTC-4)
  const cutoff = new Date(serviceDate + "T00:00:00Z") // midnight UTC du jour de service
  cutoff.setTime(cutoff.getTime() - 4 * 3600000) // UTC-4 = midnight Martinique en UTC
  // Veille 20h MQ = J-1 20:00 MQ = J 00:00 UTC
  const now = new Date()
  return now < cutoff
}

async function handleCancel(orderId: string) {
  if (!confirm("Annuler cette commande ? Le wallet sera recrédité si applicable.")) return

  try {
    const res = await fetch("/api/cancel-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    })
    if (res.ok) {
      window.location.reload()
    } else {
      alert("Impossible d'annuler cette commande. Le cutoff est peut-être dépassé.")
    }
  } catch {
    alert("Erreur réseau.")
  }
}
