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
  payment_method: string | null
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
  const wd = dt.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")
  const dm = dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`
}
function ymd(d: Date): string {
  return d.toISOString().split("T")[0]
}

type Preset = "today" | "week" | "7days" | "month" | "custom"

// Composant tableau réutilisable (mode flat ou en section sous un en-tête métier)
function OrdersTable({ orders, loading = false, onMarkPaid, markingId }: {
  orders: OrderRow[]; loading?: boolean
  onMarkPaid?: (orderId: string) => void
  markingId?: string | null
}) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-[var(--bg-alt)] text-xs uppercase text-[var(--ink-soft)]">
        <tr>
          {/* Impeccable P1 A11y — scope="col" pour annoncer correctement
              les colonnes aux lecteurs écran (WCAG 1.3.1 Info & Relationships). */}
          <th scope="col" className="text-left px-3 py-2.5 font-semibold">Date</th>
          <th scope="col" className="text-left px-3 py-2.5 font-semibold">N°</th>
          <th scope="col" className="text-left px-3 py-2.5 font-semibold">Métier</th>
          <th scope="col" className="text-left px-3 py-2.5 font-semibold">Parent</th>
          <th scope="col" className="text-left px-3 py-2.5 font-semibold">Profils</th>
          <th scope="col" className="text-left px-3 py-2.5 font-semibold">Composition</th>
          <th scope="col" className="text-left px-3 py-2.5 font-semibold">Note</th>
          <th scope="col" className="text-left px-3 py-2.5 font-semibold">Paiement</th>
          <th scope="col" className="text-left px-3 py-2.5 font-semibold no-print">Hist.</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--border)]">
        {orders.length === 0 && !loading && (
          <tr><td colSpan={9} className="px-3 py-6 text-center text-[var(--ink-soft)]">Aucune commande.</td></tr>
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
          // Impeccable P1 A11y (WCAG 1.4.1) — texte explicite en plus de la couleur/icône
          // pour daltoniens et lecteurs écran (le statut n'est plus porté que par la couleur).
          const statusIcon = o.status === "paid" ? "✅" : o.status === "pending_payment" ? "❌" : "⚪"
          const statusText = o.status === "paid" ? "Payée" : o.status === "pending_payment" ? "En attente" : o.status === "cancelled" ? "Annulée" : o.status
          const statusColor = o.status === "paid" ? "text-[var(--status-paid)]" : o.status === "pending_payment" ? "text-[var(--status-cancelled)]" : "text-[var(--ink-soft)]"
          // §7 — commande "payer sur place" : badge dédié pilotant l'encaissement comptoir.
          const isOnSite = o.payment_method === "on_site"
          const onSitePaid = isOnSite && !!o.paid_at
          return (
            <tr key={o.id} className="hover:bg-[var(--border)]">
              <td className="px-3 py-2 whitespace-nowrap font-medium">{fmtServiceDate(o.service_date)}</td>
              <td className="px-3 py-2 font-mono text-xs">{o.order_number}</td>
              <td className="px-3 py-2 text-xs">{o.source_label}</td>
              <td className="px-3 py-2" title={o.account.email}>{o.account.nom_compte}</td>
              <td className="px-3 py-2 text-xs">{profilNames || "—"}</td>
              <td className="px-3 py-2 text-xs" title={compoFull}>{compoCompact}{more}</td>
              <td className="px-3 py-2 text-center">
                {o.special_request ? <span title={o.special_request}>📝</span> : ""}
              </td>
              {isOnSite ? (
                <td className="px-3 py-2 font-medium">
                  {onSitePaid ? (
                    <span className="text-[var(--status-paid)]" aria-label={`Encaissé sur place · ${fmtPrice(o.total_cents)}`}>
                      🟢 Encaissé · {fmtPrice(o.total_cents)}
                    </span>
                  ) : (
                    <div className="flex flex-col gap-1 items-start">
                      <span className="inline-block rounded px-1.5 py-0.5 text-xs font-bold text-white bg-[var(--status-cancelled)]"
                        aria-label={`Non payé · sur place · ${fmtPrice(o.total_cents)}`}>
                        NON PAYÉ · {fmtPrice(o.total_cents)}
                      </span>
                      {onMarkPaid && (
                        <button
                          onClick={() => onMarkPaid(o.id)}
                          disabled={markingId === o.id}
                          className="focus-ring text-xs font-semibold rounded border px-2 py-1 border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--bg-alt)] disabled:opacity-50 no-print"
                          aria-label={`Marquer la commande ${o.order_number} comme encaissée`}>
                          {markingId === o.id ? "…" : "💶 Marquer encaissé"}
                        </button>
                      )}
                    </div>
                  )}
                </td>
              ) : (
                <td className={`px-3 py-2 font-medium ${statusColor}`} aria-label={`${statusText} · ${fmtPrice(o.total_cents)}`}>
                  <span aria-hidden="true">{statusIcon}</span> <span className="sr-only">{statusText}</span> {fmtPrice(o.total_cents)}
                </td>
              )}
              <td className="px-3 py-2 no-print">
                <span className="text-xs opacity-40">—</span>
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
  // §7 — id de la commande "sur place" en cours d'encaissement (désactive le bouton)
  const [markingId, setMarkingId] = useState<string | null>(null)

  // §7 — pointe l'encaissement comptoir d'une commande on_site. Mise à jour optimiste du
  // paid_at local (pas de refetch) → le badge passe au vert immédiatement.
  async function markPaid(orderId: string) {
    if (markingId) return
    setMarkingId(orderId)
    try {
      const res = await fetch("/api/admin/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, paid_at: data.paid_at, status: "paid" } : o))
      } else {
        alert(data.error || "Erreur encaissement")
      }
    } catch {
      alert("Erreur réseau")
    } finally {
      setMarkingId(null)
    }
  }

  function applyPreset(p: Preset) {
    setPreset(p)
    setActiveDayTab("all")  // reset onglet jour quand période change
    if (p !== "custom") {
      const r = presetRange(p)
      setFrom(r.from); setTo(r.to)
    }
  }
  // Reset onglet aussi quand from/to changent en custom (reset dérivé volontaire, pas de cascade)
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <div className="min-h-screen bg-[var(--bg-alt)]">
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Header */}
      <header className="bg-white border-b border-[var(--border)] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3">
          <div className="min-w-0">
            <h1 className="text-base md:text-xl font-bold text-[var(--ink)] whitespace-nowrap">Admin Panda Snack</h1>
            <p className="text-xs text-[var(--ink-soft)] truncate">{userEmail}</p>
          </div>
          {/* Mobile : rangée horizontale scrollable (rien de coupé). Desktop : inchangé. */}
          <div className="flex items-center gap-2 md:gap-3 no-print flex-nowrap overflow-x-auto md:overflow-visible [&>*]:shrink-0">
            <Link
              href={`/admin/profils`}
              className="focus-ring px-3 py-2 min-h-11 bg-white text-[var(--ink)] text-sm font-semibold rounded-lg border border-[var(--border)] hover:bg-[var(--border)]"
            >
              👥 Profils
            </Link>
            {/* Calculette prix de revient — outil HTML statique servi depuis public/ */}
            <a
              href="/calculette-prix-revient-panda-snack.html"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ouvrir la calculette prix de revient dans un nouvel onglet"
              className="focus-ring px-3 py-2 min-h-11 bg-white text-[var(--ink)] text-sm font-semibold rounded-lg border border-[var(--border)] hover:bg-[var(--border)]"
            >
              📊 Calculette
            </a>
            {/* T2 — Imprimer liste : visible seulement si onglet jour spécifique. Transmet sourceGroup. */}
            {activeDayTab !== "all" && (
              <Link
                href={`/admin/liste/${activeDayTab}${sourceGroup ? `?source_group=${sourceGroup}` : ""}`}
                className="focus-ring px-4 py-2 min-h-11 bg-[var(--accent)] text-white text-sm font-semibold rounded-lg hover:opacity-90"
              >
                🖨️ Imprimer liste
              </Link>
            )}
            {/* T3 — Étiquettes : transmet le filtre métier actif via ?metier= */}
            <Link
              href={`/admin/etiquettes/${activeDayTab !== "all" ? activeDayTab : today}${sourceGroup ? `?metier=${sourceGroup}` : ""}`}
              className="focus-ring px-4 py-2 min-h-11 bg-[var(--accent)] text-white text-sm font-semibold rounded-lg hover:opacity-90"
            >
              🏷️ Étiquettes
            </Link>
            <button
              onClick={() => window.print()}
              className="focus-ring px-4 py-2 min-h-11 bg-[var(--ink)] text-white text-sm font-semibold rounded-lg hover:opacity-90"
            >
              🖨️ Imprimer
            </button>
            <button
              onClick={async () => {
                // Efface le cookie admin (accès mot de passe) ET la session Supabase
                // (compte admin email). On couvre les deux voies d'accès.
                await fetch("/api/admin/logout", { method: "POST" }).catch(() => {})
                await createClient().auth.signOut().catch(() => {})
                window.location.href = "/admin"
              }}
              aria-label="Se déconnecter de l'espace admin"
              className="focus-ring px-3 py-2 min-h-11 text-sm rounded-md text-[var(--ink-soft)] hover:text-[var(--ink)]"
            >
              Déconnexion
            </button>
          </div>
        </div>

        {/* Filtres sticky */}
        <div className="border-t border-[var(--border)] bg-[var(--bg-alt)] px-6 py-3 no-print">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 md:gap-3">
            {/* Période — ligne scrollable sur mobile, fondue dans la rangée desktop (md:contents) */}
            <div className="flex items-center gap-2 md:gap-3 overflow-x-auto flex-nowrap md:contents [&>*]:shrink-0">
            <span className="text-xs font-semibold text-[var(--ink)] uppercase">Période</span>
            {(["today","week","7days","month","custom"] as Preset[]).map(p => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className={`focus-ring px-3 py-2.5 min-h-11 text-xs rounded-md font-medium transition-colors ${
                  preset === p ? "bg-[var(--accent)] text-white" : "bg-white text-[var(--ink)] border border-[var(--border)] hover:bg-[var(--border)]"
                }`}
              >
                {p === "today" ? "Aujourd'hui" : p === "week" ? "Cette semaine" : p === "7days" ? "7 jours" : p === "month" ? "Mois" : "Custom"}
              </button>
            ))}
            {preset === "custom" && (
              <>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                  className="px-2 py-1 text-xs border border-[var(--border)] rounded" />
                <span className="text-xs text-[var(--ink-soft)]">→</span>
                <input type="date" value={to} onChange={e => setTo(e.target.value)}
                  className="px-2 py-1 text-xs border border-[var(--border)] rounded" />
              </>
            )}
            </div>
            {/* Métier — ligne scrollable sur mobile, fondue dans la rangée desktop */}
            <div className="flex items-center gap-2 md:gap-3 overflow-x-auto flex-nowrap md:contents [&>*]:shrink-0">
            <span className="md:ml-4 text-xs font-semibold text-[var(--ink)] uppercase">Métier</span>
            {SOURCE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSourceGroup(opt.value)}
                className={`focus-ring px-3 py-2.5 min-h-11 text-xs rounded-md font-medium transition-colors ${
                  sourceGroup === opt.value ? "bg-[var(--accent)] text-white" : "bg-white text-[var(--ink)] border border-[var(--border)] hover:bg-[var(--border)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
            </div>
          </div>
        </div>
      </header>

      {/* Onglets jour (sticky sous le header de filtres) */}
      <div className="bg-white border-b border-[var(--border)] px-6 py-2 sticky top-[136px] z-[5] no-print">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-semibold text-[var(--ink)] uppercase shrink-0">Jour</span>
          <button
            onClick={() => setActiveDayTab("all")}
            className={`focus-ring px-3 py-2.5 min-h-11 text-xs rounded-md font-medium whitespace-nowrap transition-colors ${
              activeDayTab === "all" ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-alt)] text-[var(--ink)] hover:bg-[var(--border)]"
            }`}
          >
            Tous
          </button>
          {uniqueDays.map(d => (
            <button
              key={d}
              onClick={() => setActiveDayTab(d)}
              className={`focus-ring px-3 py-2.5 min-h-11 text-xs rounded-md font-medium whitespace-nowrap transition-colors ${
                activeDayTab === d ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-alt)] text-[var(--ink)] hover:bg-[var(--border)]"
              }`}
            >
              {fmtServiceDate(d)}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Cadre totaux */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-5 mb-6">
          {loading && <p className="text-sm text-[var(--ink-soft)]">Chargement…</p>}
          {error && <p className="text-sm text-[var(--status-cancelled)]">⚠ {error}</p>}
          {!error && (
            <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap md:items-baseline md:gap-x-8 md:gap-y-2">
              <div className="rounded-lg bg-[var(--bg-alt)] p-3 md:rounded-none md:bg-transparent md:p-0">
                <p className="text-xs uppercase text-[var(--ink-soft)] font-semibold">Commandes payées</p>
                <p className="text-2xl font-bold text-[var(--ink)]">
                  {totals.paidCount} <span className="text-base font-medium text-[var(--ink-soft)]">· {fmtPrice(totals.revenue)}</span>
                </p>
              </div>
              {totals.pendingCount > 0 && (
                <div className="rounded-lg bg-[var(--bg-alt)] p-3 md:rounded-none md:bg-transparent md:p-0">
                  <p className="text-xs uppercase text-[var(--ink-soft)] font-semibold">En attente</p>
                  <p className="text-2xl font-bold text-[var(--status-pending)]">{totals.pendingCount}</p>
                </div>
              )}
              {revenueBreakdown && (
                <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 md:ml-auto">
                  {revenueBreakdown.map((r, i) => (
                    <span key={i} className="text-sm text-[var(--ink)]">
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
              <div className="bg-white rounded-xl border border-[var(--border)] px-3 py-6 text-center text-[var(--ink-soft)]">
                Aucune commande sur ce jour.
              </div>
            )}
            {sectionsByMetier.map(section => {
              const sectionPaid = section.orders.filter(o => o.status === "paid")
              const sectionRev = sectionPaid.reduce((s, o) => s + o.total_cents, 0)
              return (
                <div key={section.key} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                  <div className="bg-[var(--bg-alt)] px-4 py-2 border-l-4 border-[var(--accent)]">
                    <span className="font-bold text-sm uppercase tracking-wide text-[var(--ink)]">
                      ── {section.label} ({section.orders.length} commande{section.orders.length > 1 ? "s" : ""} · {fmtPrice(sectionRev)}) ──
                    </span>
                  </div>
                  <OrdersTable orders={section.orders} onMarkPaid={markPaid} markingId={markingId} />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden mb-6">
            <OrdersTable orders={filteredOrders} loading={loading} onMarkPaid={markPaid} markingId={markingId} />
          </div>
        )}

        {/* Récap production */}
        {recap && recap.totals.orders_paid > 0 && (
          <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
            <button
              onClick={() => setProductionOpen(!productionOpen)}
              aria-expanded={productionOpen}
              aria-label={productionOpen ? "Replier le récap production" : "Déplier le récap production"}
              className="focus-ring w-full px-5 py-3 flex items-center justify-between bg-[var(--bg-alt)] hover:bg-[var(--border)] border-b border-[var(--border)] no-print"
            >
              <span className="font-semibold text-[var(--ink)]">
                📦 Récap production — {
                  activeDayTab !== "all"
                    ? fmtServiceDate(activeDayTab)
                    : (from === to ? fmtServiceDate(from) : `${fmtServiceDate(from)} → ${fmtServiceDate(to)}`)
                } ({recap.totals.orders_paid} commandes payées)
              </span>
              <span className="text-[var(--ink-soft)]">{productionOpen ? "▲" : "▼"}</span>
            </button>
            {productionOpen && (
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                {recap.production.menus.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase font-bold text-[var(--ink)] mb-3">🍱 Menus</h3>
                    <ul className="space-y-4">
                      {recap.production.menus.map((m, i) => (
                        <li key={i}>
                          <p className="font-bold text-[var(--ink)]">{m.qty} × {m.name}</p>
                          {/* T5 — composition détaillée (plat + toppings) directement à partir des notes */}
                          {m.items_detail && m.items_detail.length > 0 && (
                            <ul className="ml-3 mt-1 space-y-0.5 text-sm text-[var(--ink)]">
                              {m.items_detail.map((d, j) => (
                                <li key={j}>
                                  <strong>{d.qty}×</strong> {d.note}
                                </li>
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
                    <h3 className="text-xs uppercase font-bold text-[var(--ink)] mb-3">🥪 À la carte</h3>
                    <ul className="space-y-4">
                      {recap.production.items.map((c, i) => (
                        <li key={i}>
                          <p className="font-bold text-[var(--ink)]">{c.qty_total} × {c.category}</p>
                          {c.items_detail && c.items_detail.length > 0 && (
                            <ul className="ml-3 mt-1 space-y-0.5 text-sm text-[var(--ink)]">
                              {c.items_detail.map((d, j) => (
                                <li key={j}>
                                  <strong>{d.qty}×</strong> {d.note}
                                </li>
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
