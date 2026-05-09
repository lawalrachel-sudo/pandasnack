"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

const METIER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "TOUS" },
  { value: "pandattitude", label: "Pandattitude" },
  { value: "ecole_la_patience", label: "La Patience" },
  { value: "panda_guest", label: "Panda Guest" },
]

interface Label {
  order_number: string
  metier: string
  service_date_short: string
  profil_prenom: string
  profil_classe: string | null
  items: { name: string }[]
  allergens: string[]
  prepared_at: string
  dlc_at: string
  dlc_hours: number
}

function fmtDateOnlyShort(iso: string): string {
  // Format Martinique : DD/MM/YY (date seule, sans heure)
  // Conversion UTC → Martinique (UTC-4) pour ne pas afficher la veille
  // si prepared_at est à 08:00 Mqe = 12:00 UTC.
  const d = new Date(iso)
  const local = new Date(d.getTime() - 4 * 3600 * 1000)
  const day = String(local.getUTCDate()).padStart(2, "0")
  const month = String(local.getUTCMonth() + 1).padStart(2, "0")
  const year = String(local.getUTCFullYear()).slice(2)
  return `${day}/${month}/${year}`
}

export function EtiquettesClient({ serviceDate }: { serviceDate: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const metier = searchParams.get("metier") || ""
  const [labels, setLabels] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function setMetier(value: string) {
    const qs = new URLSearchParams(searchParams.toString())
    if (value) qs.set("metier", value)
    else qs.delete("metier")
    router.replace(`/admin/etiquettes/${serviceDate}${qs.toString() ? "?" + qs.toString() : ""}`)
  }

  // T6 — navigation date : préserve filtre métier
  function navigateToDate(newDate: string) {
    const qs = new URLSearchParams(searchParams.toString())
    router.push(`/admin/etiquettes/${newDate}${qs.toString() ? "?" + qs.toString() : ""}`)
  }

  // T6 — onglets jours = jours avec orders paid sur fenêtre [today, today+14j]
  const [daysWithOrders, setDaysWithOrders] = useState<string[]>([])
  useEffect(() => {
    let cancel = false
    async function loadDays() {
      try {
        const today = new Date().toISOString().split("T")[0]
        const end = new Date(); end.setDate(end.getDate() + 14)
        const endStr = end.toISOString().split("T")[0]
        const qs = new URLSearchParams({ from: today, to: endStr, status: "paid" })
        const res = await fetch(`/api/admin/orders?${qs.toString()}`)
        const json = await res.json()
        if (!res.ok) return
        const set = new Set<string>()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const o of (json.orders || []) as any[]) {
          if (o.service_date) set.add(o.service_date)
        }
        // Inclure la date courante même si pas d'orders, pour cohérence visuelle
        set.add(serviceDate)
        if (!cancel) setDaysWithOrders(Array.from(set).sort())
      } catch {
        // silencieux : la liste de jours est un nice-to-have, pas bloquant
      }
    }
    loadDays()
    return () => { cancel = true }
  }, [serviceDate])

  function fmtDayShort(d: string): string {
    const dt = new Date(d + "T12:00:00")
    const wd = dt.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")
    const dm = dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
    return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`
  }
  const todayYmd = new Date().toISOString().split("T")[0]

  useEffect(() => {
    let cancel = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const qs = new URLSearchParams({ service_date: serviceDate })
        if (metier) qs.set("source_group", metier)
        const res = await fetch(`/api/admin/labels?${qs.toString()}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Erreur labels")
        if (!cancel) setLabels(json.labels || [])
      } catch (e) {
        if (!cancel) setError((e as Error).message)
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    load()
    return () => { cancel = true }
  }, [serviceDate, metier])

  return (
    <div>
      <style jsx global>{`
        @page { size: A4; margin: 13.5mm 0; }
        body { background: #f3f4f6; }
        .labels-sheet {
          display: grid;
          grid-template-columns: 105mm 105mm;
          grid-auto-rows: 57mm;
          gap: 0;
          width: 210mm;
          margin: 0 auto;
          padding: 0;
        }
        /* T7 — étiquette densifiée 105×57mm, padding 4mm vertical 5mm horizontal,
           zone utile 95×49mm, marge sécurité impression OK.
           overflow:hidden = filet de sécurité si commande exceptionnelle dépasse. */
        .label {
          width: 105mm;
          height: 57mm;
          padding: 4mm 5mm;
          box-sizing: border-box;
          page-break-inside: avoid;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          color: #1f2937;
          background: white;
          border: 0.5px dashed #d1d5db;
          display: flex;
          flex-direction: column;
        }
        .label-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 9pt;
          font-weight: bold;
          color: #374151;
          margin-bottom: 2mm;
        }
        .label-header .num {
          font-weight: 400;
          color: #6b7280;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 8.5pt;
        }
        .label-prenom {
          font-size: 14pt;
          font-weight: 800;
          line-height: 1.05;
          margin-bottom: 2mm;
        }
        .label-prenom .classe {
          font-size: 9pt;
          font-style: italic;
          font-weight: 500;
          color: #6b7280;
          margin-left: 2mm;
        }
        .label-items {
          font-size: 11pt;
          color: #1f2937;
          line-height: 1.15;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        /* Groupe bas (allergènes + footer) collé directement après les items.
           Le vide naturel se reporte en bas de l'étiquette (zone d'impression
           sécurisée, pas de débordement). */
        .label-bottom {
          margin-top: 0;
        }
        .label-items.dense {
          font-size: 8pt;
          line-height: 1.0;
        }
        .label-items li {
          padding: 0;
          margin: 0;
        }
        .label-allergens {
          font-size: 8pt;
          font-style: italic;
          color: #92400E;
          margin-top: 1.5mm;
          line-height: 1.15;
        }
        .label-footer {
          font-size: 8pt;
          color: #4b5563;
          margin-top: 0.5mm;
          line-height: 1.2;
        }
        .label-footer .conservation {
          font-style: italic;
          color: #6b7280;
        }
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .label { border: none !important; }
          .labels-sheet { gap: 0; }
        }
      `}</style>

      <div className="no-print bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <Link href="/admin/dashboard" className="text-sm text-blue-600 hover:underline">← Retour dashboard</Link>
            <div className="flex items-center gap-3 mt-1">
              <h1 className="text-xl font-bold">Étiquettes</h1>
              {/* T6 — date picker HTML5 natif */}
              <input
                type="date"
                value={serviceDate}
                onChange={e => navigateToDate(e.target.value)}
                className="px-2 py-1 text-base font-semibold border border-gray-300 rounded-md"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{labels.length} étiquette(s) · format Office Star OS43425 (105 × 57 mm, 10/A4)</p>
          </div>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-lg hover:bg-orange-700"
          >
            🖨️ Imprimer
          </button>
        </div>
        {/* T6 — onglets jours avec orders paid sur 14 prochains jours */}
        <div className="px-6 pb-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-700 uppercase">Jour</span>
          {daysWithOrders.map(d => {
            const isToday = d === todayYmd
            const active = d === serviceDate
            return (
              <button
                key={d}
                onClick={() => navigateToDate(d)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {isToday ? "Aujourd'hui" : fmtDayShort(d)}
              </button>
            )
          })}
        </div>
        <div className="px-6 pb-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-700 uppercase">Métier</span>
          {METIER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setMetier(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                metier === opt.value ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-center py-8 text-gray-500">Chargement…</p>}
      {error && <p className="text-center py-8 text-red-600">⚠ {error}</p>}
      {!loading && !error && labels.length === 0 && (
        <p className="text-center py-8 text-gray-500">Aucune commande payée à étiqueter pour cette date.</p>
      )}

      <div className="labels-sheet" style={{ marginTop: "13.5mm" }}>
        {labels.map(l => {
          // T7 — densification auto si > 5 items (cas rare, filet de sécurité)
          const dense = l.items.length > 5
          return (
            <div key={l.order_number} className="label">
              <div className="label-header">
                <span>{l.metier} · {l.service_date_short}</span>
                <span className="num">{l.order_number}</span>
              </div>
              <div className="label-prenom">
                {l.profil_prenom}
                {l.profil_classe && <span className="classe">({l.profil_classe})</span>}
              </div>
              <ul className={`label-items${dense ? " dense" : ""}`}>
                {l.items.map((it, idx) => (
                  <li key={idx}>• {it.name}</li>
                ))}
              </ul>
              <div className="label-bottom">
                {l.allergens.length > 0 && (
                  <div className="label-allergens">
                    ⚠️ Allergènes : {l.allergens.join(" · ")}
                  </div>
                )}
                <div className="label-footer">
                  Préparé le {fmtDateOnlyShort(l.prepared_at)} <span className="conservation">· À conserver au frais et consommer rapidement</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
