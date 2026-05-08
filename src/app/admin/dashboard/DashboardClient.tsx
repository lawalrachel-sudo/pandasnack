"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "TOUS" },
  { value: "pandattitude", label: "Pandattitude" },
  { value: "ecole_la_patience", label: "La Patience" },
  { value: "panda_guest", label: "Panda Guest" },
]

interface Item {
  id: string
  profil_prenom: string | null
  profil_classe: string | null
  menu_formula_name: string | null
  catalog_item_name: string | null
  allergens: string[]
  qty: number
  price_cents: number
  notes: string
}

interface OrderRow {
  id: string
  order_number: string
  service_date: string
  source_group: string
  source_label: string
  status: "paid" | "pending_payment" | "cancelled" | string
  paid_at: string | null
  total_cents: number
  special_request: string | null
  account: { id: string; nom_compte: string; email: string; telephone: string | null }
  items: Item[]
}

interface RecapData {
  totals: {
    orders_count: number
    orders_paid: number
    orders_pending: number
    revenue_cents: number
    revenue_by_source: Record<string, number>
  }
  production: {
    menus: { name: string; qty: number; details: { label: string; qty: number }[] }[]
    items: { category: string; qty_total: number; details: { name: string; qty: number }[] }[]
  }
}

function fmtPrice(c: number): string { return `${(c / 100).toFixed(2).replace(".", ",")} €` }
function fmtServiceDate(d: string): string {
  const dt = new Date(d + "T12:00:00")
  const wd = dt.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")
  const dm = dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`
}
function ymd(d: Date): string {
  return d.toISOString().split("T")[0]
}

type Preset = "today" | "week" | "7days" | "month" | "custom"

// Composant tableau réutilisable (mode flat ou en section sous un en-tête métier)
function OrdersTable({ orders, loading = false }: { orders: OrderRow[]; loading?: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs uppercase text-gray-600">
        <tr>
          <th className="text-left px-3 py-2.5 font-semibold">Date</th>
          <th className="text-left px-3 py-2.5 font-semibold">N°</th>
          <th className="text-left px-3 py-2.5 font-semibold">Métier</th>
          <th className="text-left px-3 py-2.5 font-semibold">Parent</th>
          <th className="text-left px-3 py-2.5 font-semibold">Profils</th>
          <th className="text-left px-3 py-2.5 font-semibold">Composition</th>
          <th className="text-left px-3 py-2.5 font-semibold">Note</th>
          <th className="text-left px-3 py-2.5 font-semibold">Paiement</th>
          <th className="text-left px-3 py-2.5 font-semibold no-print">Hist.</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {orders.length === 0 && !loading && (
          <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">Aucune commande.</td></tr>
        )}
        {orders.map(o => {
          const profilNames = Array.from(new Set(o.items.map(i => i.profil_prenom).filter(Boolean))).join(", ")
          const compoCompact = o.items.map(i => {
            const name = i.menu_formula_name || i.catalog_item_name || "Article"
            return `1 ${name}`
          }).slice(0, 2).join(" + ")
          const compoFull = o.items.map(i => {
            const name = i.menu_formula_name && i.catalog_item_name
              ? `${i.menu_formula_name} — ${i.catalog_item_name}`
              : (i.menu_formula_name || i.catalog_item_name || "Article")
            return `${name}${i.profil_prenom ? ` (${i.profil_prenom})` : ""}`
          }).join("\n")
          const more = o.items.length > 2 ? ` +${o.items.length - 2}` : ""
          const statusIcon = o.status === "paid" ? "✅" : o.status === "pending_payment" ? "❌" : "⚪"
          const statusColor = o.status === "paid" ? "text-green-700" : o.status === "pending_payment" ? "text-red-600" : "text-gray-500"
          return (
            <tr key={o.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 whitespace-nowrap font-medium">{fmtServiceDate(o.service_date)}</td>
              <td className="px-3 py-2 font-mono text-xs">{o.order_number}</td>
              <td className="px-3 py-2 text-xs">{o.source_label}</td>
              <td className="px-3 py-2" title={o.account.email}>{o.account.nom_compte}</td>
              <td className="px-3 py-2 text-xs">{profilNames || "—"}</td>
              <td className="px-3 py-2 text-xs" title={compoFull}>{compoCompact}{more}</td>
              <td className="px-3 py-2 text-center">
                {o.special_request ? <span title={o.special_request}>📝</span> : ""}
              </td>
              <td className={`px-3 py-2 font-medium ${statusColor}`}>{statusIcon} {fmtPrice(o.total_cents)}</td>
              <td className="px-3 py-2 no-print">
                <Link href={`/admin/historique/${o.account.id}`} className="text-xs text-blue-600 hover:underline">
                  Voir →
                </Link>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date()
  if (preset === "today") return { from: ymd(now), to: ymd(now) }
  if (preset === "week") {
    // Lundi → dimanche ISO
    const d = new Date(now)
    const dow = d.getDay() // 0=dim, 1=lun
    const offset = dow === 0 ? -6 : 1 - dow
    const monday = new Date(d); monday.setDate(d.getDate() + offset)
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    return { from: ymd(monday), to: ymd(sunday) }
  }
  if (preset === "7days") {
    const end = new Date(now); end.setDate(end.getDate() + 6)
    return { from: ymd(now), to: ymd(end) }
  }
  if (preset === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: ymd(first), to: ymd(last) }
  }
  return { from: ymd(now), to: ymd(now) }
}

export function DashboardClient({ userEmail }: { userEmail: string }) {
  const [preset, setPreset] = useState<Preset>("week")
  const initial = presetRange("week")
  const [from, setFrom] = useState<string>(initial.from)
  const [to, setTo] = useState<string>(initial.to)
  const [sourceGroup, setSourceGroup] = useState<string>("")
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [recap, setRecap] = useState<RecapData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [productionOpen, setProductionOpen] = useState(true)
  // Onglets jour : "all" = période complète, "YYYY-MM-DD" = un jour précis
  const [activeDayTab, setActiveDayTab] = useState<string>("all")

  function applyPreset(p: Preset) {
    setPreset(p)
    setActiveDayTab("all")  // reset onglet jour quand période change
    if (p !== "custom") {
      const r = presetRange(p)
      setFrom(r.from); setTo(r.to)
    }
  }
  // Reset onglet aussi quand from/to changent en custom
  useEffect(() => { setActiveDayTab("all") }, [from, to])

  // /api/admin/orders : toujours sur la période complète (pour avoir uniqueDays).
  // /api/admin/recap : soit période, soit jour spécifique selon activeDayTab.
  useEffect(() => {
    let cancel = false
    async function load() {
      if (!from || !to) return
      setLoading(true); setError(null)
      try {
        const qsOrders = new URLSearchParams({ from, to })
        if (sourceGroup) qsOrders.set("source_group", sourceGroup)
        const recapFrom = activeDayTab === "all" ? from : activeDayTab
        const recapTo = activeDayTab === "all" ? to : activeDayTab
        const qsRecap = new URLSearchParams({ from: recapFrom, to: recapTo })
        if (sourceGroup) qsRecap.set("source_group", sourceGroup)
        const [oRes, rRes] = await Promise.all([
          fetch(`/api/admin/orders?${qsOrders.toString()}`),
          fetch(`/api/admin/recap?${qsRecap.toString()}`),
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
  }, [from, to, sourceGroup, activeDayTab])

  // Jours uniques présents dans les orders de la période → onglets dynamiques
  const uniqueDays = useMemo(() => {
    const set = new Set<string>()
    for (const o of orders) if (o.service_date) set.add(o.service_date)
    return Array.from(set).sort()
  }, [orders])

  // Orders filtrées par onglet jour
  const filteredOrders = useMemo(() => {
    if (activeDayTab === "all") return orders
    return orders.filter(o => o.service_date === activeDayTab)
  }, [orders, activeDayTab])

  // Sections par métier : seulement si onglet jour spécifique ET pas de filtre métier
  const sectionsByMetier = useMemo(() => {
    if (activeDayTab === "all" || sourceGroup) return null
    const groups = new Map<string, { label: string; orders: OrderRow[] }>()
    for (const o of filteredOrders) {
      const key = o.source_group || "unknown"
      const entry = groups.get(key) || { label: o.source_label || key, orders: [] }
      entry.orders.push(o)
      groups.set(key, entry)
    }
    // Sort orders intra-section par order_number
    for (const g of groups.values()) {
      g.orders.sort((a, b) => a.order_number.localeCompare(b.order_number))
    }
    // Ordre des sections : pandattitude, ecole_la_patience, panda_guest, autres
    const order = ["pandattitude", "ecole_la_patience", "panda_guest"]
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        const ia = order.indexOf(a); const ib = order.indexOf(b)
        if (ia === -1 && ib === -1) return a.localeCompare(b)
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
      .map(([key, g]) => ({ key, ...g }))
  }, [activeDayTab, sourceGroup, filteredOrders])

  const today = useMemo(() => ymd(new Date()), [])

  // Totaux dérivés de filteredOrders (reflète onglet + filtre métier)
  const totals = useMemo(() => {
    const paid = filteredOrders.filter(o => o.status === "paid")
    const pending = filteredOrders.filter(o => o.status === "pending_payment")
    const revenue = paid.reduce((s, o) => s + o.total_cents, 0)
    return { paidCount: paid.length, pendingCount: pending.length, revenue }
  }, [filteredOrders])

  // Décomposition par métier (visible si pas de filtre Métier ET ≥ 2 métiers présents)
  const revenueBreakdown = useMemo(() => {
    if (sourceGroup) return null
    const map = new Map<string, { count: number; cents: number; label: string }>()
    for (const o of filteredOrders.filter(x => x.status === "paid")) {
      const key = o.source_group
      const entry = map.get(key) || { count: 0, cents: 0, label: o.source_label || key }
      entry.count += 1
      entry.cents += o.total_cents
      map.set(key, entry)
    }
    const arr = Array.from(map.values())
    if (arr.length <= 1) return null
    return arr.sort((a, b) => b.cents - a.cents)
  }, [sourceGroup, filteredOrders])

  return (
    <div className="min-h-screen bg-gray-50">
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Admin Panda Snack</h1>
            <p className="text-xs text-gray-500">{userEmail}</p>
          </div>
          <div className="flex items-center gap-3 no-print">
            <Link
              href={`/admin/profils`}
              className="px-3 py-2 bg-white text-gray-700 text-sm font-semibold rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              👥 Profils
            </Link>
            {/* T2 — Imprimer liste : visible seulement si onglet jour spécifique. Transmet sourceGroup. */}
            {activeDayTab !== "all" && (
              <Link
                href={`/admin/liste/${activeDayTab}${sourceGroup ? `?source_group=${sourceGroup}` : ""}`}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
              >
                🖨️ Imprimer liste
              </Link>
            )}
            {/* T3 — Étiquettes : transmet le filtre métier actif via ?metier= */}
            <Link
              href={`/admin/etiquettes/${activeDayTab !== "all" ? activeDayTab : today}${sourceGroup ? `?metier=${sourceGroup}` : ""}`}
              className="px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-lg hover:bg-orange-700"
            >
              🏷️ Étiquettes
            </Link>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-gray-700 text-white text-sm font-semibold rounded-lg hover:bg-gray-800"
            >
              🖨️ Imprimer
            </button>
            <button
              onClick={async () => {
                await createClient().auth.signOut()
                window.location.href = "/auth"
              }}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Déconnexion
            </button>
          </div>
        </div>

        {/* Filtres sticky */}
        <div className="border-t border-gray-100 bg-gray-50 px-6 py-3 no-print">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-gray-700 uppercase">Période</span>
            {(["today","week","7days","month","custom"] as Preset[]).map(p => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  preset === p ? "bg-orange-600 text-white" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                {p === "today" ? "Aujourd'hui" : p === "week" ? "Cette semaine" : p === "7days" ? "7 jours" : p === "month" ? "Mois" : "Custom"}
              </button>
            ))}
            {preset === "custom" && (
              <>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-200 rounded" />
                <span className="text-xs text-gray-500">→</span>
                <input type="date" value={to} onChange={e => setTo(e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-200 rounded" />
              </>
            )}
            <span className="ml-4 text-xs font-semibold text-gray-700 uppercase">Métier</span>
            {SOURCE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSourceGroup(opt.value)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  sourceGroup === opt.value ? "bg-blue-600 text-white" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Onglets jour (sticky sous le header de filtres) */}
      <div className="bg-white border-b border-gray-200 px-6 py-2 sticky top-[136px] z-[5] no-print">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-semibold text-gray-700 uppercase shrink-0">Jour</span>
          <button
            onClick={() => setActiveDayTab("all")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium whitespace-nowrap transition-colors ${
              activeDayTab === "all" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Tous
          </button>
          {uniqueDays.map(d => (
            <button
              key={d}
              onClick={() => setActiveDayTab(d)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium whitespace-nowrap transition-colors ${
                activeDayTab === d ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {fmtServiceDate(d)}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Cadre totaux */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          {loading && <p className="text-sm text-gray-500">Chargement…</p>}
          {error && <p className="text-sm text-red-600">⚠ {error}</p>}
          {!error && (
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
              <div>
                <p className="text-xs uppercase text-gray-500 font-semibold">Commandes payées</p>
                <p className="text-2xl font-bold text-gray-900">
                  {totals.paidCount} <span className="text-base font-medium text-gray-600">· {fmtPrice(totals.revenue)}</span>
                </p>
              </div>
              {totals.pendingCount > 0 && (
                <div>
                  <p className="text-xs uppercase text-gray-500 font-semibold">En attente</p>
                  <p className="text-2xl font-bold text-amber-600">{totals.pendingCount}</p>
                </div>
              )}
              {revenueBreakdown && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 ml-auto">
                  {revenueBreakdown.map((r, i) => (
                    <span key={i} className="text-sm text-gray-700">
                      <strong>{r.label}</strong> : {r.count} · {fmtPrice(r.cents)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tableau commandes — soit à plat, soit en sections par métier (onglet jour + métier=Tous) */}
        {sectionsByMetier ? (
          <div className="space-y-6 mb-6">
            {sectionsByMetier.length === 0 && !loading && (
              <div className="bg-white rounded-xl border border-gray-200 px-3 py-6 text-center text-gray-500">
                Aucune commande sur ce jour.
              </div>
            )}
            {sectionsByMetier.map(section => {
              const sectionPaid = section.orders.filter(o => o.status === "paid")
              const sectionRev = sectionPaid.reduce((s, o) => s + o.total_cents, 0)
              return (
                <div key={section.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-l-4 border-blue-500">
                    <span className="font-bold text-sm uppercase tracking-wide text-gray-800">
                      ── {section.label} ({section.orders.length} commande{section.orders.length > 1 ? "s" : ""} · {fmtPrice(sectionRev)}) ──
                    </span>
                  </div>
                  <OrdersTable orders={section.orders} />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <OrdersTable orders={filteredOrders} loading={loading} />
          </div>
        )}

        {/* Récap production */}
        {recap && recap.totals.orders_paid > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setProductionOpen(!productionOpen)}
              className="w-full px-5 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 border-b border-gray-200 no-print"
            >
              <span className="font-semibold text-gray-900">
                📦 Récap production — {
                  activeDayTab !== "all"
                    ? fmtServiceDate(activeDayTab)
                    : (from === to ? fmtServiceDate(from) : `${fmtServiceDate(from)} → ${fmtServiceDate(to)}`)
                } ({recap.totals.orders_paid} commandes payées)
              </span>
              <span className="text-gray-500">{productionOpen ? "▲" : "▼"}</span>
            </button>
            {productionOpen && (
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                {recap.production.menus.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase font-bold text-gray-700 mb-3">🍱 Menus</h3>
                    <ul className="space-y-3">
                      {recap.production.menus.map((m, i) => (
                        <li key={i}>
                          <p className="font-semibold text-gray-900">{m.qty} × {m.name}</p>
                          {m.details.length > 0 && (
                            <ul className="ml-4 mt-1 space-y-0.5 text-sm text-gray-600">
                              {m.details.map((d, j) => (
                                <li key={j}>├─ {d.label} : <strong>{d.qty}</strong></li>
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
                    <h3 className="text-xs uppercase font-bold text-gray-700 mb-3">🥪 À la carte</h3>
                    <ul className="space-y-3">
                      {recap.production.items.map((c, i) => (
                        <li key={i}>
                          <p className="font-semibold text-gray-900">{c.qty_total} × {c.category}</p>
                          {c.details.length > 0 && (
                            <ul className="ml-4 mt-1 space-y-0.5 text-sm text-gray-600">
                              {c.details.map((d, j) => (
                                <li key={j}>├─ {d.name} : <strong>{d.qty}</strong></li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
