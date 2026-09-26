"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { classifySections, itemLine, routeTotals, type SvcOrder } from "@/lib/service-du-jour"

// PS-06b §6 — Feuille de route A4 imprimable : liste à préparer (prénom + parent + commande
// complète + options/notes + paiement), puis totaux par plat et boissons.

function jourLong(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
}

export function VeilleClient({ serviceDate }: { serviceDate: string }) {
  const [orders, setOrders] = useState<SvcOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/service?date=${serviceDate}`)
        const json = await res.json()
        if (annule) return
        if (!res.ok) throw new Error(json.error || "Erreur")
        setOrders(json.orders || [])
      } catch (e) { if (!annule) setError((e as Error).message) }
    })()
    return () => { annule = true }
  }, [serviceDate])

  const sections = useMemo(() => classifySections(orders || []), [orders])
  const totals = useMemo(() => routeTotals(orders || []), [orders])

  return (
    <div className="veille">
      <style>{PRINT_CSS}</style>

      <div className="no-print veille-bar">
        <Link href={`/admin/dashboard`} className="veille-back">← Service du jour</Link>
        <button onClick={() => window.print()} className="veille-print">🖨️ Imprimer</button>
      </div>

      {error && <p style={{ color: "#DC2626" }}>⚠ {error}</p>}
      {!orders && !error && <p>Chargement…</p>}

      {orders && (
        <>
          <header className="veille-head">
            <h1>Feuille de route — {jourLong(serviceDate)}</h1>
            <p>{sections.aPreparer.length} commande(s) à préparer</p>
          </header>

          <section>
            <h2>À préparer</h2>
            {sections.aPreparer.length === 0 && <p>Aucune commande.</p>}
            <table className="veille-table">
              <thead>
                <tr><th>Enfant</th><th>Parent</th><th>Commande</th><th>Paiement</th></tr>
              </thead>
              <tbody>
                {sections.aPreparer.map((o) => {
                  const aEncaisser = o.payment_method === "on_site" && !o.paid_at
                  const notes: string[] = []
                  if (o.notes_allergies) notes.push(`⚠️ ${o.notes_allergies}`)
                  if (o.special_request) notes.push(`📝 ${o.special_request}`)
                  return (
                    <tr key={o.id}>
                      <td className="col-enfant"><strong>{o.child_prenom}</strong>{o.child_classe ? <div className="classe">{o.child_classe}</div> : null}</td>
                      <td>{o.parent_nom}{o.parent_telephone ? <div className="classe">{o.parent_telephone}</div> : null}</td>
                      <td>
                        <ul>
                          {o.items.map((it, i) => {
                            const { label, options } = itemLine(it)
                            return <li key={i}>{it.qty > 1 ? `${it.qty}× ` : ""}{label}{options.length ? <span className="opts"> — {options.join(", ")}</span> : null}</li>
                          })}
                        </ul>
                        {notes.length > 0 && <div className="notes">{notes.join(" · ")}</div>}
                      </td>
                      <td className="col-pay">{aEncaisser ? <strong>💶 à encaisser</strong> : "✅ payé"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section className="veille-totals">
            <div>
              <h2>Totaux plats</h2>
              <ul>
                {totals.plats.map((t) => <li key={t.label}><span className="tqty">{t.qty}</span> {t.label}</li>)}
                {totals.plats.length === 0 && <li>—</li>}
              </ul>
            </div>
            <div>
              <h2>Boissons</h2>
              <ul>
                {totals.boissons.map((t) => <li key={t.label}><span className="tqty">{t.qty}</span> {t.label}</li>)}
                {totals.boissons.length === 0 && <li>—</li>}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

const PRINT_CSS = `
.veille { max-width: 800px; margin: 0 auto; padding: 16px; font-family: var(--font-display, Fredoka), system-ui, sans-serif; color: #2b2018; }
.veille-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.veille-back { color: #C85A3C; text-decoration: none; font-size: 14px; }
.veille-print { background: #C85A3C; color: #fff; border: none; border-radius: 10px; padding: 10px 16px; font-weight: 700; cursor: pointer; min-height: 44px; }
.veille-head h1 { font-size: 22px; margin: 0 0 4px; }
.veille-head p { margin: 0 0 16px; color: #6b5742; }
.veille h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .5px; border-bottom: 2px solid #2b2018; padding-bottom: 4px; margin: 20px 0 8px; }
.veille-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.veille-table th { text-align: left; font-size: 11px; text-transform: uppercase; color: #6b5742; padding: 4px 6px; border-bottom: 1px solid #ccc; }
.veille-table td { padding: 8px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
.veille-table ul { margin: 0; padding-left: 16px; }
.veille-table .col-enfant strong { font-size: 15px; }
.veille-table .classe { font-size: 11px; color: #6b5742; }
.veille-table .opts { color: #6b5742; }
.veille-table .notes { margin-top: 4px; font-size: 12px; color: #92400E; font-weight: 600; }
.veille-table .col-pay { white-space: nowrap; }
.veille-totals { display: flex; gap: 40px; margin-top: 24px; }
.veille-totals ul { list-style: none; padding: 0; margin: 0; font-size: 14px; line-height: 1.8; }
.veille-totals .tqty { display: inline-block; min-width: 24px; font-weight: 800; }
@media print {
  .no-print { display: none !important; }
  .veille { max-width: none; padding: 0; }
  @page { size: A4; margin: 14mm; }
  .veille-table td, .veille-table th { border-color: #999; }
}
`
