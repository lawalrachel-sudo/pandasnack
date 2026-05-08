"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface Label {
  order_number: string
  metier: string
  service_date_short: string
  piece_index: number
  piece_total: number
  profil_prenom: string
  profil_classe: string | null
  produit_principal: string
  composition: string[]
  allergens: string[]
  prepared_at: string
  dlc_at: string
  dlc_hours: number
}

function fmtDateTimeShort(iso: string): string {
  const d = new Date(iso)
  // Format Martinique : DD/MM/YY Hh
  const day = String(d.getUTCDate()).padStart(2, "0")  // Note : pour vraie TZ Martinique on utiliserait Intl
  const month = String(d.getUTCMonth() + 1).padStart(2, "0")
  const year = String(d.getUTCFullYear()).slice(2)
  const hour = d.getUTCHours()
  // Conversion UTC → Martinique (UTC-4) approximative
  const localHour = (hour - 4 + 24) % 24
  return `${day}/${month}/${year} ${localHour}h`
}

export function EtiquettesClient({ serviceDate }: { serviceDate: string }) {
  const [labels, setLabels] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    async function load() {
      try {
        const res = await fetch(`/api/admin/labels?service_date=${serviceDate}`)
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
  }, [serviceDate])

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
        .label {
          width: 105mm;
          height: 57mm;
          padding: 3mm;
          box-sizing: border-box;
          page-break-inside: avoid;
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
          font-size: 11pt;
          font-weight: bold;
          padding-bottom: 1mm;
          border-bottom: 0.5px solid #e5e7eb;
        }
        .label-piece {
          font-size: 10pt;
          font-weight: 400;
          color: #6b7280;
        }
        .label-prenom {
          font-size: 14pt;
          font-weight: 800;
          margin-top: 1.5mm;
          padding-bottom: 1.5mm;
          border-bottom: 0.5px solid #e5e7eb;
        }
        .label-prenom .classe {
          font-size: 11pt;
          font-weight: 500;
          color: #4b5563;
          margin-left: 2mm;
        }
        .label-produit {
          font-size: 11pt;
          font-weight: bold;
          text-transform: uppercase;
          margin-top: 1.5mm;
        }
        .label-compo {
          font-size: 9pt;
          color: #374151;
          margin-top: 0.5mm;
          line-height: 1.2;
        }
        .label-allergens {
          font-size: 8pt;
          background: #FFF8DC;
          padding: 1.5mm;
          margin-top: 1.5mm;
          border-radius: 1mm;
          line-height: 1.2;
        }
        .label-footer {
          font-size: 7pt;
          color: #555;
          margin-top: auto;
          padding-top: 1mm;
          border-top: 0.5px solid #e5e7eb;
          line-height: 1.3;
        }
        .label-footer .num {
          color: #9ca3af;
        }
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .label { border: none !important; }
          .labels-sheet { gap: 0; }
        }
      `}</style>

      <div className="no-print bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
        <div>
          <Link href="/admin/dashboard" className="text-sm text-blue-600 hover:underline">← Retour dashboard</Link>
          <h1 className="text-xl font-bold mt-1">Étiquettes — {serviceDate}</h1>
          <p className="text-xs text-gray-500">{labels.length} étiquette(s) · format Office Star OS43425 (105 × 57 mm, 10/A4)</p>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-lg hover:bg-orange-700"
        >
          🖨️ Imprimer
        </button>
      </div>

      {loading && <p className="text-center py-8 text-gray-500">Chargement…</p>}
      {error && <p className="text-center py-8 text-red-600">⚠ {error}</p>}
      {!loading && !error && labels.length === 0 && (
        <p className="text-center py-8 text-gray-500">Aucune commande payée à étiqueter pour cette date.</p>
      )}

      <div className="labels-sheet" style={{ marginTop: "13.5mm" }}>
        {labels.map((l, i) => (
          <div key={`${l.order_number}-${l.piece_index}`} className="label">
            <div className="label-header">
              <span>{l.metier} · {l.service_date_short}</span>
              <span className="label-piece">Pièce {l.piece_index}/{l.piece_total}</span>
            </div>
            <div className="label-prenom">
              {l.profil_prenom}
              {l.profil_classe && <span className="classe">· {l.profil_classe}</span>}
            </div>
            <div className="label-produit">{l.produit_principal}</div>
            {l.composition.length > 0 && (
              <div className="label-compo">
                {l.composition.map((c, ci) => (
                  <span key={ci}>• {c}{ci < l.composition.length - 1 ? "  " : ""}</span>
                ))}
              </div>
            )}
            {l.allergens.length > 0 && (
              <div className="label-allergens">
                ⚠ {l.allergens.join(" · ")}
              </div>
            )}
            <div className="label-footer">
              <div>Préparé : {fmtDateTimeShort(l.prepared_at)} &nbsp;·&nbsp; DLC : {fmtDateTimeShort(l.dlc_at)}</div>
              <div className="num">#{l.order_number}</div>
            </div>
            {/* Force unique key for React */}
            <span style={{ display: "none" }}>{i}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
