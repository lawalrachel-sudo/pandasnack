"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

const SOURCE_LABELS: Record<string, string> = {
  pandattitude: "Pandattitude",
  ecole_la_patience: "La Patience",
  panda_guest: "Panda Guest",
}

interface OrderItem {
  id: string
  profil_prenom: string | null
  profil_classe: string | null
  menu_formula_name: string | null
  catalog_item_name: string | null
  qty: number
}

interface Order {
  id: string
  order_number: string
  service_date: string
  source_group: string
  source_label: string
  status: string
  total_cents: number
  special_request: string | null
  account: { nom_compte: string }
  items: OrderItem[]
}

interface RecapData {
  totals: { orders_paid: number; orders_pending: number; revenue_cents: number }
  production: {
    menus: {
      name: string; qty: number;
      details: { label: string; qty: number }[]
      items_detail: { note: string; qty: number }[]
    }[]
    items: {
      category: string; qty_total: number;
      details: { name: string; qty: number }[]
      items_detail: { note: string; qty: number }[]
    }[]
  }
}

function fmtPrice(c: number): string { return `${(c / 100).toFixed(2).replace(".", ",")} €` }
function fmtServiceDate(d: string): string {
  const dt = new Date(d + "T12:00:00")
  const wd = dt.toLocaleDateString("fr-FR", { weekday: "long" })
  const dm = dt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`
}

export function ListeClient({ serviceDate, sourceGroup }: { serviceDate: string; sourceGroup: string }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [recap, setRecap] = useState<RecapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    async function load() {
      try {
        const qs = new URLSearchParams({ from: serviceDate, to: serviceDate })
        if (sourceGroup) qs.set("source_group", sourceGroup)
        const [oRes, rRes] = await Promise.all([
          fetch(`/api/admin/orders?${qs.toString()}`),
          fetch(`/api/admin/recap?${qs.toString()}`),
        ])
        const oJson = await oRes.json()
        const rJson = await rRes.json()
        if (!oRes.ok) throw new Error(oJson.error || "Erreur orders")
        if (!rRes.ok) throw new Error(rJson.error || "Erreur recap")
        if (!cancel) {
          setOrders(oJson.orders || [])
          setRecap(rJson)
        }
      } catch (e) {
        if (!cancel) setError((e as Error).message)
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    load()
    return () => { cancel = true }
  }, [serviceDate, sourceGroup])

  // Si pas de filtre métier → grouper par sections
  const sections = useMemo(() => {
    if (sourceGroup) return null
    const map = new Map<string, { label: string; orders: Order[] }>()
    for (const o of orders) {
      const key = o.source_group
      const e = map.get(key) || { label: o.source_label, orders: [] }
      e.orders.push(o)
      map.set(key, e)
    }
    for (const g of map.values()) {
      g.orders.sort((a, b) => a.order_number.localeCompare(b.order_number))
    }
    const order = ["pandattitude", "ecole_la_patience", "panda_guest"]
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        const ia = order.indexOf(a); const ib = order.indexOf(b)
        if (ia === -1 && ib === -1) return a.localeCompare(b)
        if (ia === -1) return 1; if (ib === -1) return -1
        return ia - ib
      })
      .map(([key, g]) => ({ key, ...g }))
  }, [orders, sourceGroup])

  const flatOrders = useMemo(() =>
    [...orders].sort((a, b) => a.order_number.localeCompare(b.order_number)),
    [orders])

  const metierLabel = sourceGroup ? SOURCE_LABELS[sourceGroup] || sourceGroup : "Tous les métiers"

  return (
    <div className="bg-white">
      <style jsx global>{`
        @page { size: A4 portrait; margin: 12mm; }
        body { background: white; }
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
        .liste-table { width: 100%; border-collapse: collapse; font-size: 11pt; }
        .liste-table th { background: #f3f4f6; text-align: left; padding: 6px 8px; border-bottom: 2px solid #d1d5db; font-size: 9pt; text-transform: uppercase; }
        .liste-table td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        .section-header { background: #f9fafb; padding: 8px 12px; border-left: 4px solid #2563eb; font-weight: 700; margin-top: 16px; margin-bottom: 8px; }
      `}</style>

      <div className="no-print border-b border-gray-200 px-6 py-3 sticky top-0 bg-white z-10 flex items-center justify-between">
        <Link href="/admin/dashboard" className="text-sm text-blue-600 hover:underline">← Retour dashboard</Link>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-lg hover:bg-orange-700"
        >
          🖨️ Imprimer
        </button>
      </div>

      <div className="max-w-[210mm] mx-auto p-6 print:p-0">
        {/* En-tête */}
        <div className="border-b-2 border-gray-300 pb-3 mb-4">
          <h1 className="text-2xl font-bold">Liste commandes — {fmtServiceDate(serviceDate)}</h1>
          <p className="text-sm text-gray-700 mt-1">
            <strong>Métier :</strong> {metierLabel}
            {recap && (
              <>
                {" · "}
                <strong>{recap.totals.orders_paid}</strong> commande(s) payée(s) · {fmtPrice(recap.totals.revenue_cents)}
                {recap.totals.orders_pending > 0 && <> · <span className="text-amber-700">{recap.totals.orders_pending} en attente</span></>}
              </>
            )}
          </p>
        </div>

        {loading && <p className="text-gray-500">Chargement…</p>}
        {error && <p className="text-red-600">⚠ {error}</p>}

        {!loading && !error && (
          <>
            {sections ? (
              sections.length === 0 ? <p className="text-gray-500">Aucune commande.</p>
              : sections.map(s => {
                const sectionPaid = s.orders.filter(o => o.status === "paid")
                const sectionRev = sectionPaid.reduce((acc, o) => acc + o.total_cents, 0)
                return (
                  <div key={s.key} className="mb-6">
                    <div className="section-header">
                      ── {s.label.toUpperCase()} ({s.orders.length} commande{s.orders.length > 1 ? "s" : ""} · {fmtPrice(sectionRev)}) ──
                    </div>
                    <ListeTable orders={s.orders} />
                  </div>
                )
              })
            ) : (
              flatOrders.length === 0
                ? <p className="text-gray-500">Aucune commande.</p>
                : <ListeTable orders={flatOrders} />
            )}

            {/* Récap production */}
            {recap && recap.totals.orders_paid > 0 && (
              <div className="mt-8 pt-4 border-t-2 border-gray-300">
                <h2 className="text-lg font-bold mb-3">📦 Récap production</h2>
                <div className="grid grid-cols-2 gap-6 text-sm">
                  {recap.production.menus.length > 0 && (
                    <div>
                      <h3 className="text-xs uppercase font-bold text-gray-700 mb-2">🍱 Menus</h3>
                      <ul className="space-y-3">
                        {recap.production.menus.map((m, i) => (
                          <li key={i}>
                            <p className="font-bold">{m.qty} × {m.name}</p>
                            {/* T5 — composition détaillée pour la cuisine (plat + toppings) */}
                            {m.items_detail && m.items_detail.length > 0 && (
                              <ul className="ml-3 mt-1 text-gray-700">
                                {m.items_detail.map((d, j) => (
                                  <li key={j}><strong>{d.qty}×</strong> {d.note}</li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {recap.production.items.length > 0 && (
                    <div>
                      <h3 className="text-xs uppercase font-bold text-gray-700 mb-2">🥪 À la carte</h3>
                      <ul className="space-y-3">
                        {recap.production.items.map((c, i) => (
                          <li key={i}>
                            <p className="font-bold">{c.qty_total} × {c.category}</p>
                            {c.items_detail && c.items_detail.length > 0 && (
                              <ul className="ml-3 mt-1 text-gray-700">
                                {c.items_detail.map((d, j) => (
                                  <li key={j}><strong>{d.qty}×</strong> {d.note}</li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ListeTable({ orders }: { orders: Order[] }) {
  return (
    <table className="liste-table">
      <thead>
        <tr>
          <th>N°</th>
          <th>Profil(s)</th>
          <th>Composition</th>
          <th>Note</th>
          <th>Paiement</th>
        </tr>
      </thead>
      <tbody>
        {orders.map(o => {
          const profilNames = Array.from(new Set(
            o.items.map(i => i.profil_prenom + (i.profil_classe ? ` (${i.profil_classe})` : "")).filter(Boolean)
          )).join(", ")
          const compo = o.items.map(i => {
            const name = i.menu_formula_name && i.catalog_item_name
              ? `${i.menu_formula_name} — ${i.catalog_item_name}`
              : (i.menu_formula_name || i.catalog_item_name || "Article")
            return `1× ${name}${i.profil_prenom ? ` · ${i.profil_prenom}` : ""}`
          }).join(" / ")
          const statusIcon = o.status === "paid" ? "✅" : o.status === "pending_payment" ? "❌" : "⚪"
          return (
            <tr key={o.id}>
              <td className="font-mono text-xs">{o.order_number}</td>
              <td>{profilNames || "—"}</td>
              <td>{compo}</td>
              <td className="max-w-[150px]">{o.special_request || ""}</td>
              <td>{statusIcon} {(o.total_cents / 100).toFixed(2).replace(".", ",")} €</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
