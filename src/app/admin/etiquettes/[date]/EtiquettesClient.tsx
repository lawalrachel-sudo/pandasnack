"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminBackButton } from "../../AdminBackButton"
import { planLabels, usedAfterPrint, usedForStartCell, CELLS_PER_SHEET, SHEET_COLS } from "@/lib/etiquettes-planche"
import { METIER_FILTERS } from "@/lib/metiers"

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

  // PS-12 — planche entamée : cases déjà utilisées (mémoire serveur), départ à une case, prompt post-impression.
  const [usedCells, setUsedCells] = useState<number[]>([])
  const [startCell, setStartCell] = useState("")
  const [afterPrint, setAfterPrint] = useState(false)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/etiquettes/planche")
        const json = await res.json()
        if (!cancel && res.ok) setUsedCells(json.used_cells || [])
      } catch { /* non bloquant */ }
    })()
    return () => { cancel = true }
  }, [])

  async function saveUsed(cells: number[]) {
    setUsedCells(cells)
    try {
      await fetch("/api/admin/etiquettes/planche", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ used_cells: cells }),
      })
    } catch { /* non bloquant */ }
  }
  function toggleCell(cell: number) {
    saveUsed(usedCells.includes(cell) ? usedCells.filter((c) => c !== cell) : [...usedCells, cell].sort((a, b) => a - b))
  }
  function applyStartCell() {
    const n = parseInt(startCell, 10)
    if (Number.isFinite(n) && n >= 1 && n <= CELLS_PER_SHEET) { saveUsed(usedForStartCell(n)); setStartCell("") }
  }

  const sheets = useMemo(() => planLabels(labels.length, usedCells), [labels.length, usedCells])

  function handlePrint() {
    window.print()
    setAfterPrint(true)
  }
  function resumePlanche() { saveUsed(usedAfterPrint(labels.length, usedCells)); setAfterPrint(false) }
  function newPlanche() { saveUsed([]); setAfterPrint(false) }

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
        @page { size: A4; margin: 6mm 0; }
        body { background: #f3f4f6; }
        /* PS-06c-d — à l'écran, la grille A4 (210mm) déborde sur mobile (~390px). On la rend
           défilable horizontalement, scrollbar TOUJOURS visible pour repérer la colonne de
           droite (Sofia). À l'impression, ce conteneur est neutralisé (cf. @media print). */
        .labels-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: auto;
          padding-bottom: 10px;
        }
        .labels-scroll::-webkit-scrollbar { height: 12px; -webkit-appearance: none; }
        .labels-scroll::-webkit-scrollbar-track { background: #e5e7eb; border-radius: 6px; }
        .labels-scroll::-webkit-scrollbar-thumb { background: #9ca3af; border-radius: 6px; border: 2px solid #e5e7eb; }
        .labels-sheet {
          display: grid;
          grid-template-columns: 105mm 105mm;
          grid-auto-rows: 57mm;
          gap: 0;
          width: 210mm;
          margin: 0 auto;
          padding: 0;
        }
        /* Étiquette 105×57mm. PS-12 — marge intérieure 5mm sur les 4 côtés (imprimantes sans
           impression bord à bord). overflow:hidden = filet si une commande dépasse. */
        .label {
          width: 105mm;
          height: 57mm;
          padding: 5mm;
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
        /* Case utilisée / vide : strictement vide. À l'écran, léger fond pour visualiser la grille. */
        .label-empty { background: #fafafa; }
        @media print { .label-empty { background: white !important; } }
        .label-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 9pt;
          font-weight: bold;
          color: #374151;
          margin-bottom: 1mm;
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
          margin-bottom: 1mm;
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
          /* PS-06c-d — pas de conteneur de défilement à l'impression : la grille A4 sort
             intacte, aucune coupure de page. */
          .labels-scroll { overflow: visible !important; padding-bottom: 0 !important; }
        }
      `}</style>

      <div className="no-print bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <AdminBackButton />
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
            onClick={handlePrint}
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
          {METIER_FILTERS.map(opt => (
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

      {/* PS-12 — Mini-plan de la planche (2×5). Toucher une case = déjà utilisée (grise, barrée). */}
      <div className="no-print px-6 pt-3 pb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-700 uppercase">Planche</span>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${SHEET_COLS}, minmax(40px, 44px))` }}>
            {Array.from({ length: CELLS_PER_SHEET }, (_, c) => {
              const used = usedCells.includes(c)
              return (
                <button key={c} onClick={() => toggleCell(c)}
                  aria-pressed={used}
                  className="h-10 rounded-md border text-sm font-semibold transition-colors"
                  style={used
                    ? { background: "#e5e7eb", color: "#9ca3af", borderColor: "#d1d5db", textDecoration: "line-through" }
                    : { background: "#fff", color: "#374151", borderColor: "#9ca3af" }}>
                  {c + 1}
                </button>
              )
            })}
          </div>
          <label className="text-xs text-gray-600 flex items-center gap-1">
            Commencer à la case n°
            <input type="number" min={1} max={CELLS_PER_SHEET} value={startCell}
              onChange={(e) => setStartCell(e.target.value)}
              className="w-14 h-9 px-2 border border-gray-300 rounded-md text-sm" />
            <button onClick={applyStartCell} className="h-9 px-3 bg-gray-800 text-white rounded-md text-xs font-semibold">OK</button>
          </label>
          {usedCells.length > 0 && (
            <button onClick={() => saveUsed([])} className="text-xs text-blue-600 underline">Planche neuve</button>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          {usedCells.length} case(s) utilisée(s) · les étiquettes se placent dans les cases libres, dans l&apos;ordre.
        </p>
      </div>

      {afterPrint && (
        <div className="no-print mx-6 mb-3 rounded-lg border p-3 flex items-center gap-3 flex-wrap" style={{ borderColor: "#F5D5A0", background: "#FEF3E2" }}>
          <span className="text-sm">Impression envoyée. Cette planche est maintenant partiellement utilisée.</span>
          <button onClick={resumePlanche} className="h-9 px-3 bg-orange-600 text-white rounded-md text-xs font-semibold">
            Reprendre la planche ({usedAfterPrint(labels.length, usedCells).length} cases utilisées)
          </button>
          <button onClick={newPlanche} className="h-9 px-3 bg-white border border-gray-300 rounded-md text-xs font-semibold">Planche neuve</button>
        </div>
      )}

      {loading && <p className="text-center py-8 text-gray-500">Chargement…</p>}
      {error && <p className="text-center py-8 text-red-600">⚠ {error}</p>}
      {!loading && !error && labels.length === 0 && (
        <p className="text-center py-8 text-gray-500">Aucune commande payée à étiqueter pour cette date.</p>
      )}

      {!loading && !error && labels.length > 0 && (
        <p className="no-print px-6 pt-3 text-xs text-gray-500">
          ← Fais défiler horizontalement pour voir toutes les étiquettes (colonne de droite).
        </p>
      )}

      {/* PS-12 — une grille par planche ; cases utilisées/vides strictement vides ; débordement → planche suivante. */}
      {!loading && !error && labels.length > 0 && sheets.map((sheet, si) => (
        <div key={si} className="labels-scroll">
        <div className="labels-sheet" style={{ marginTop: "6mm", pageBreakBefore: si > 0 ? "always" : undefined }}>
          {sheet.cells.map((c) => {
            const l = c.labelIndex != null ? labels[c.labelIndex] : null
            if (!l) return <div key={c.cell} className="label label-empty" aria-hidden="true" />
            const dense = l.items.length > 5
            return (
              <div key={c.cell} className="label">
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
      ))}
    </div>
  )
}
