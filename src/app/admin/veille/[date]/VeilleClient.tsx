"use client"

import { useEffect, useMemo, useState } from "react"
import { classifySections, itemLine, routeTotals, type SvcOrder } from "@/lib/service-du-jour"
import { AdminBackButton } from "../../AdminBackButton"

// PS-06b §6 / PS-08a-e — Feuille de route A4 imprimable : commandes à préparer (précommande),
// lignes comptoir « pour ce jour » sous chaque enfant, puis totaux plats + « Comptoir — à sortir ».

interface ComptoirLine {
  id: string
  prenom: string | null
  profil_id: string | null
  payment_mode: string
  jeton_qty: number | null
  items: { name: string; qty: number }[]
}

function jourLong(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
}

const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase()

function modeTag(mode: string): string {
  return mode === "wallet" ? "wallet ✅" : mode === "especes" ? "espèces 💶"
    : mode === "cb_sumup" ? "SumUp 💳" : "jeton"
}

function formatSaleLine(l: ComptoirLine): string {
  const items = l.items.map((it) => (it.qty > 1 ? `${it.qty}× ` : "") + it.name).join(" · ")
  return `${items} (${modeTag(l.payment_mode)})`
}

export function VeilleClient({ serviceDate }: { serviceDate: string }) {
  const [orders, setOrders] = useState<SvcOrder[] | null>(null)
  const [isDevoirs, setIsDevoirs] = useState(false)
  const [isStage, setIsStage] = useState(false)  // PS-17
  const [comptoir, setComptoir] = useState<ComptoirLine[]>([])
  const [comptoirTotals, setComptoirTotals] = useState<{ name: string; qty: number }[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const [rsvc, rcpt] = await Promise.all([
          fetch(`/api/admin/service?date=${serviceDate}`),
          fetch(`/api/admin/boutique/route-lines?date=${serviceDate}`),
        ])
        const jsvc = await rsvc.json()
        if (!rsvc.ok) throw new Error(jsvc.error || "Erreur")
        const jcpt = await rcpt.json().catch(() => ({ lines: [], totals: [] }))
        if (annule) return
        setOrders(jsvc.orders || [])
        setIsDevoirs(jsvc.slot?.day_type === "devoirs")
        setIsStage(jsvc.slot?.day_type === "stage")
        setComptoir(rcpt.ok ? (jcpt.lines || []) : [])
        setComptoirTotals(rcpt.ok ? (jcpt.totals || []) : [])
      } catch (e) { if (!annule) setError((e as Error).message) }
    })()
    return () => { annule = true }
  }, [serviceDate])

  const sections = useMemo(() => classifySections(orders || []), [orders])
  const totals = useMemo(() => routeTotals(orders || []), [orders])

  // Regroupe les lignes comptoir par enfant (prénom normalisé).
  const comptoirByChild = useMemo(() => {
    const m = new Map<string, ComptoirLine[]>()
    for (const l of comptoir) {
      const k = norm(l.prenom)
      const arr = m.get(k) || []; arr.push(l); m.set(k, arr)
    }
    return m
  }, [comptoir])

  // Prénoms ayant une précommande à préparer.
  const precommandeKeys = useMemo(
    () => new Set(sections.aPreparer.map((o) => norm(o.child_prenom))),
    [sections],
  )

  // Enfants « comptoir seul » : lignes comptoir sans précommande correspondante.
  const comptoirSeul = useMemo(() => {
    const out: { prenom: string; lines: ComptoirLine[] }[] = []
    for (const [k, lines] of comptoirByChild) {
      if (precommandeKeys.has(k) && k !== "") continue
      out.push({ prenom: lines[0]?.prenom || "Client de passage", lines })
    }
    return out.sort((a, b) => a.prenom.localeCompare(b.prenom, "fr"))
  }, [comptoirByChild, precommandeKeys])

  const comptoirTotalQty = useMemo(() => comptoirTotals.reduce((s, t) => s + t.qty, 0), [comptoirTotals])

  return (
    <div className="veille">
      <style>{PRINT_CSS}</style>

      <div className="no-print veille-bar">
        <AdminBackButton />
        <button onClick={() => window.print()} className="veille-print">🖨️ Imprimer</button>
      </div>

      {error && <p style={{ color: "#DC2626" }}>⚠ {error}</p>}
      {!orders && !error && <p>Chargement…</p>}

      {orders && (
        <>
          <header className="veille-head">
            <h1>Feuille de route — {jourLong(serviceDate)}{isDevoirs ? " · Panda Devoirs" : ""}{isStage ? " · STAGE" : ""}</h1>
            <p>{sections.aPreparer.length} commande(s) à préparer{comptoir.length > 0 ? ` · ${comptoir.length} ligne(s) comptoir` : ""}</p>
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
                  const cptLines = comptoirByChild.get(norm(o.child_prenom)) || []
                  return (
                    <tr key={o.id}>
                      <td className="col-enfant"><strong>{o.child_prenom}</strong>{o.sa_ki_ni ? <span className="skn-tag">🍽️ Sa ki ni</span> : null}{o.child_classe ? <div className="classe">{o.child_classe}</div> : null}</td>
                      <td>{o.parent_nom}{o.parent_telephone ? <div className="classe">{o.parent_telephone}</div> : null}</td>
                      <td>
                        <ul>
                          {o.items.map((it, i) => {
                            const { label, options } = itemLine(it)
                            return <li key={i}>{it.qty > 1 ? `${it.qty}× ` : ""}{label}{options.length ? <span className="opts"> — {options.join(", ")}</span> : null}</li>
                          })}
                        </ul>
                        {cptLines.length > 0 && (
                          <div className="comptoir-lines">
                            <span className="comptoir-tag">+ Comptoir</span>
                            {cptLines.map((l) => <div key={l.id}>{formatSaleLine(l)}</div>)}
                          </div>
                        )}
                        {notes.length > 0 && <div className="notes">{notes.join(" · ")}</div>}
                      </td>
                      <td className="col-pay">{aEncaisser ? <strong>💶 à encaisser</strong> : "✅ payé"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          {comptoirSeul.length > 0 && (
            <section>
              <h2>Comptoir seul</h2>
              <table className="veille-table">
                <tbody>
                  {comptoirSeul.map((c) => (
                    <tr key={c.prenom}>
                      <td className="col-enfant"><strong>{c.prenom}</strong> <span className="badge-cpt">comptoir seul</span></td>
                      <td>
                        <div className="comptoir-lines">
                          {c.lines.map((l) => <div key={l.id}>{formatSaleLine(l)}</div>)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="veille-totals">
            <div>
              <h2>Totaux plats</h2>
              <ul>
                {totals.plats.map((t) => <li key={t.label}><span className="tqty">{t.qty}</span> {t.label}</li>)}
                {totals.plats.length === 0 && <li>—</li>}
              </ul>
              {comptoirTotalQty > 0 && <p className="dont-comptoir">dont comptoir : {comptoirTotalQty} article(s) — voir § Comptoir</p>}
            </div>
            <div>
              <h2>Boissons</h2>
              <ul>
                {totals.boissons.map((t) => <li key={t.label}><span className="tqty">{t.qty}</span> {t.label}</li>)}
                {totals.boissons.length === 0 && <li>—</li>}
              </ul>
            </div>
          </section>

          {comptoirTotals.length > 0 && (
            <section>
              <h2>🛍️ Comptoir — à sortir</h2>
              <ul className="comptoir-totals">
                {comptoirTotals.map((t) => <li key={t.name}><span className="tqty">{t.qty}</span> {t.name}</li>)}
              </ul>
            </section>
          )}
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
.comptoir-lines { margin-top: 4px; font-size: 12px; color: #5A3C1E; }
.comptoir-tag { display: inline-block; font-weight: 800; color: #C85A3C; margin-right: 6px; }
.skn-tag { display: inline-block; font-size: 10px; font-weight: 800; color: #fff; background: #DC2626; border-radius: 999px; padding: 1px 6px; margin-left: 6px; }
.badge-cpt { font-size: 10px; font-weight: 700; color: #92400E; background: #FEF3C7; border: 1px solid #FCD34D; border-radius: 999px; padding: 1px 6px; }
.veille-totals { display: flex; gap: 40px; margin-top: 24px; }
.veille-totals ul { list-style: none; padding: 0; margin: 0; font-size: 14px; line-height: 1.8; }
.veille-totals .tqty { display: inline-block; min-width: 24px; font-weight: 800; }
.dont-comptoir { font-size: 12px; color: #6b5742; font-style: italic; margin: 6px 0 0; }
.comptoir-totals { list-style: none; padding: 0; margin: 0; font-size: 14px; line-height: 1.8; }
.comptoir-totals .tqty { display: inline-block; min-width: 24px; font-weight: 800; }
@media print {
  .no-print { display: none !important; }
  .veille { max-width: none; padding: 0; }
  @page { size: A4; margin: 14mm; }
  .veille-table td, .veille-table th { border-color: #999; }
}
`
