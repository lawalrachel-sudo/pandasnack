"use client"

import { useState, useMemo, useRef } from "react"
import Link from "next/link"
import { Navbar } from "@/components/Navbar"

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

function fmtPrice(c: number): string { return `${(c / 100).toFixed(2).replace(".", ",")} €` }
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
  special_request: string | null
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
  const printRef = useRef<HTMLDivElement>(null)

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

  const filteredOrders = useMemo(() => {
    if (selectedProfilId === "all") return orders
    return orders.filter(o => o.order_items?.some(item => item.profil_id === selectedProfilId))
  }, [orders, selectedProfilId])

  const groupedOrders = useMemo(() => {
    const groups: Record<string, Order[]> = {}
    for (const order of filteredOrders) {
      const date = order.service_slots?.service_date || "sans-date"
      if (!groups[date]) groups[date] = []
      groups[date].push(order)
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [filteredOrders])

  function handlePrint() {
    const el = printRef.current
    if (!el) return
    const w = window.open("", "_blank")
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Ma commande - Panda Snack</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; color: #3A2A20; font-size: 13px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .header { margin-bottom: 16px; border-bottom: 2px solid #C85A3C; padding-bottom: 12px; }
        .meta { color: #6B5742; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #F0E6D6; text-align: left; padding: 8px 6px; font-size: 11px; border-bottom: 2px solid #E8D6BF; }
        td { padding: 6px; border-bottom: 1px solid #E8D6BF; font-size: 12px; }
        .paid { color: #166534; } .pending { color: #B45309; }
        @media print { body { padding: 12px; } }
        @page { size: A4 portrait; margin: 15mm; }
      </style>
    </head><body>
      <div class="header">
        <h1>Panda Snack - Ma commande</h1>
        <p class="meta">Compte : ${account.nom_compte}</p>
        <p class="meta">pandasnack.online</p>
      </div>
      ${el.innerHTML}
    </body></html>`)
    w.document.close()
    setTimeout(() => { w.print() }, 300)
  }

  return (
    <div className="min-h-screen pb-20 max-w-lg mx-auto">
      <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} />

      <div className="px-4 pt-6">
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--ink)" }}>Voir mes commandes</h1>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>60 derniers jours</p>
      </div>

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

      {calendarData.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="font-bold text-sm mb-2" style={{ color: "var(--ink-soft)" }}>Prochains jours</h2>
          <div className="flex gap-1.5 overflow-x-auto pb-2">
            {calendarData.map(({ slot, profilStatuses }) => {
              const anyOrder = profilStatuses.some(ps => ps.hasOrder)
              const allOrdered = profilStatuses.every(ps => ps.hasOrder)
              const anyPaid = profilStatuses.some(ps => ps.status === "paid" || ps.status === "in_preparation" || ps.status === "ready" || ps.status === "delivered")
              const dt = new Date(slot.service_date + "T12:00:00")
              const dayNum = dt.getDate()
              const dayName = dt.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")
              const monthName = dt.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")

              return (
                <div key={slot.id} className="flex flex-col items-center min-w-[48px] py-2 px-1 rounded-xl border text-center"
                  style={{
                    borderColor: anyOrder ? "var(--accent-2)" : "var(--border)",
                    background: allOrdered ? "#E8F5E9" : anyOrder ? "#FEF3E2" : "transparent",
                  }}>
                  <span className="text-[10px] uppercase" style={{ color: "var(--ink-soft)" }}>{dayName}</span>
                  <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>{dayNum}</span>
                  <span className="text-[9px] uppercase" style={{ color: "var(--ink-soft)" }}>{monthName}</span>
                  <span className="text-xs mt-0.5">
                    {anyPaid ? "🟢" : anyOrder ? "🟡" : "—"}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px]" style={{ color: "var(--ink-soft)" }}>
            <span>🟢 payé</span>
            <span>🟡 en attente de paiement</span>
            <span>— rien commandé</span>
          </div>
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
                  const canModify = (order.status === "paid" || order.status === "pending_payment") && isBeforeCutoff(order.service_slots?.service_date)
                  const canCancel = canModify
                  const childNames = [...new Set(order.order_items?.map(i => i.profils?.prenom || i.prenom_libre).filter(Boolean))]

                  return (
                    <div key={order.id} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                      <button onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                        className="w-full p-3 flex items-center justify-between text-left">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.color }}>
                              {st.dot} {st.label}
                            </span>
                            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                              {childNames.length > 0 ? `${childNames.join(", ")} · ` : ""}#{order.order_number}
                            </span>
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
                            {order.order_items?.map(item => {
                              const lineModifiable = canModify
                              return (
                                <div key={item.id} className="flex justify-between items-start text-sm gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p>{item.notes}</p>
                                    <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                                      {item.profils?.prenom || item.prenom_libre}
                                      {item.takeaway ? " · A emporter" : ""}
                                    </p>
                                    {lineModifiable && (
                                      <div className="flex gap-3 mt-1">
                                        <Link href="/commander" className="text-[11px] underline" style={{ color: "var(--accent)" }}>Modifier</Link>
                                        <button onClick={() => handleDeleteItem(item.id)} className="text-[11px] underline" style={{ color: "#DC2626" }}>Supprimer</button>
                                      </div>
                                    )}
                                  </div>
                                  <span className="font-medium shrink-0">{fmtPrice(item.line_total_cents)}</span>
                                </div>
                              )
                            })}
                          </div>

                          {order.special_request && (
                            <div className="mt-2 p-2 rounded-lg text-xs" style={{ background: "var(--bg-alt)" }}>
                              <strong>Note :</strong> {order.special_request}
                            </div>
                          )}

                          {canCancel && (
                            <div className="flex gap-2 mt-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                              <button className="flex-1 h-9 rounded-lg text-xs font-semibold text-white" style={{ background: "#DC2626" }}
                                onClick={() => handleCancel(order.id)}>
                                Annuler toute la commande
                              </button>
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

      {/* Tableau imprimable cache */}
      <div ref={printRef} style={{ display: "none" }}>
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

      <div className="px-4 mt-8">
        <Link href="/commander" className="block w-full h-12 rounded-xl font-semibold text-white text-center leading-[3rem]" style={{ background: "var(--accent)" }}>
          Ma commande
        </Link>
      </div>
    </div>
  )
}

function isBeforeCutoff(serviceDate?: string): boolean {
  if (!serviceDate) return false
  const cutoff = new Date(serviceDate + "T00:00:00Z")
  cutoff.setTime(cutoff.getTime() - 4 * 3600000)
  const now = new Date()
  return now < cutoff
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
      alert("Impossible d'annuler cette commande. Le cutoff est peut-etre depasse.")
    }
  } catch {
    alert("Erreur reseau.")
  }
}
