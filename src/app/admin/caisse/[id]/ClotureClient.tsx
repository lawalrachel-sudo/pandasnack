"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AdminBackButton } from "../../AdminBackButton"
import { PERIOD_LABEL, type Cloture } from "@/lib/caisse"

function euro(c: number | null | undefined) { return `${((Number(c) || 0) / 100).toFixed(2).replace(".", ",")} €` }

export function ClotureClient({ id }: { id: string }) {
  const [c, setC] = useState<Cloture | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/caisse/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setC(json.cloture)
    } catch (e) { setError((e as Error).message) }
  }, [id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  if (error) return <div style={S.page}><AdminBackButton /><p style={S.err}>{error}</p></div>
  if (!c) return <div style={S.page}><AdminBackButton /><p style={S.muted}>Chargement…</p></div>

  const z = c.data
  const pm = z.precommandes.par_mode
  const cm = z.comptoir.par_mode

  return (
    <div style={S.page}>
      <div className="no-print"><AdminBackButton /></div>
      <div className="no-print" style={S.actions}>
        <Link href="/admin/caisse" style={S.back}>← Caisse</Link>
        <div style={{ display: "flex", gap: 8 }}>
          <a href={`/api/admin/caisse/${id}/csv?format=archive`} style={S.btn}>CSV</a>
          <a href={`/api/admin/caisse/${id}/csv?format=pennylane`} style={S.btn}>Pennylane</a>
          <button onClick={() => window.print()} style={S.btnPrimary}>Imprimer</button>
        </div>
      </div>

      <div style={S.sheet}>
        <h1 style={S.h1}>Clôture {PERIOD_LABEL[c.period_type]}</h1>
        <div style={S.meta}>Du {c.period_start} au {c.period_end} · générée le {new Date(c.generated_at).toLocaleString("fr-FR")}</div>

        <h2 style={S.h2}>Précommandes ({z.precommandes.nb})</h2>
        <Row l="Stripe" v={euro(pm.stripe)} />
        <Row l="Wallet" v={euro(pm.wallet)} />
        <Row l="Espèces" v={euro(pm.especes)} />
        <Row l="CB SumUp" v={euro(pm.cb_sumup)} />
        <Row l="Non encaissé" v={euro(pm.non_encaisse)} />

        <h2 style={S.h2}>Comptoir ({z.comptoir.nb} vente(s), {z.comptoir.nb_annulations} annulation(s))</h2>
        <Row l="Wallet" v={euro(cm.wallet)} />
        <Row l="Espèces" v={euro(cm.especes)} />
        <Row l="CB SumUp" v={euro(cm.cb_sumup)} />
        <Row l="Jetons Bambou" v={`${z.comptoir.jetons_qty} jeton(s) · 0,00 €`} />

        <h2 style={S.h2}>Wallet</h2>
        <Row l="Consommé" v={euro(z.wallet.consomme)} />
        <Row l="Recharge Stripe" v={euro(z.wallet.recharge.stripe)} />
        <Row l="Recharge espèces" v={euro(z.wallet.recharge.especes)} />
        <Row l="Recharge CB SumUp" v={euro(z.wallet.recharge.cb_sumup)} />
        <Row l="Dette totale (soldes)" v={euro(z.wallet.dette_totale)} />

        <h2 style={S.h2}>Totaux</h2>
        <Row l="Total TTC" v={euro(z.totaux.ttc)} strong />
        <Row l="Espèces attendues" v={euro(z.totaux.especes_attendues)} strong />
        {c.cash_counted_cents !== null && (
          <>
            <Row l="Espèces comptées" v={euro(c.cash_counted_cents)} />
            <Row l="Écart de caisse" v={`${c.cash_diff_cents! > 0 ? "+" : ""}${euro(c.cash_diff_cents)}`} strong />
            {c.cash_note && <div style={S.note}>Note : {c.cash_note}</div>}
          </>
        )}

        <h2 style={S.h2}>Articles</h2>
        <table style={S.table}>
          <thead><tr><th style={S.th}>Article</th><th style={S.thR}>Qté</th><th style={S.thR}>Total</th><th style={S.th}>Source</th></tr></thead>
          <tbody>
            {z.articles.map((a) => (
              <tr key={a.sku}>
                <td style={S.td}>{a.name}</td>
                <td style={S.tdR}>{a.qty}</td>
                <td style={S.tdR}>{euro(a.total_cents)}</td>
                <td style={S.td}>{a.source === "comptoir" ? "Comptoir" : "Précommande"}</td>
              </tr>
            ))}
            {z.articles.length === 0 && <tr><td style={S.td} colSpan={4}>Aucun article.</td></tr>}
          </tbody>
        </table>
      </div>

      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
    </div>
  )
}

function Row({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return <div style={{ ...S.row, ...(strong ? S.rowStrong : {}) }}><span>{l}</span><span>{v}</span></div>
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: "0 auto", padding: "12px 14px 60px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  actions: { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "8px 0 14px", gap: 8, flexWrap: "wrap" },
  back: { color: "var(--accent)", textDecoration: "none", fontSize: 14 },
  btn: { minHeight: 40, padding: "0 14px", display: "inline-flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 10, textDecoration: "none", color: "var(--ink)", background: "var(--bg)", fontSize: 14 },
  btnPrimary: { minHeight: 40, padding: "0 16px", border: "none", borderRadius: 10, background: "var(--accent)", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  sheet: { background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: 24, color: "#111" },
  h1: { fontSize: 24, fontWeight: 800, margin: "0 0 4px" },
  meta: { fontSize: 13, color: "#666", marginBottom: 12 },
  h2: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#888", margin: "18px 0 6px", borderBottom: "1px solid #eee", paddingBottom: 4 },
  row: { display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 15 },
  rowStrong: { fontWeight: 800 },
  note: { fontSize: 13, color: "#666", fontStyle: "italic", marginTop: 4 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14, marginTop: 6 },
  th: { textAlign: "left", padding: "6px 4px", borderBottom: "2px solid #ddd", fontSize: 12 },
  thR: { textAlign: "right", padding: "6px 4px", borderBottom: "2px solid #ddd", fontSize: 12 },
  td: { textAlign: "left", padding: "5px 4px", borderBottom: "1px solid #eee" },
  tdR: { textAlign: "right", padding: "5px 4px", borderBottom: "1px solid #eee" },
  muted: { color: "var(--ink-soft)", fontSize: 14 },
  err: { color: "#DC2626", fontSize: 14, margin: "8px 0" },
}
