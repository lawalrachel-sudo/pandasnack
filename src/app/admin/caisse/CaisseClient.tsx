"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AdminBackButton } from "../AdminBackButton"
import { PERIOD_LABEL, topArticles, type CaisseZ, type Cloture, type PeriodType } from "@/lib/caisse"

function euro(c: number | null | undefined) { return `${((Number(c) || 0) / 100).toFixed(2).replace(".", ",")} €` }

interface Payload {
  today: string
  z_today: CaisseZ
  is_closed: boolean
  clotures: Cloture[]
  analytics: { j7: CaisseZ | null; j30: CaisseZ | null }
}

export function CaisseClient() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<"" | PeriodType>("")
  const [toast, setToast] = useState<string | null>(null)
  const [recon, setRecon] = useState<Record<string, { counted: string; note: string }>>({})

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/caisse${filter ? `?type=${filter}` : ""}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setData(json)
    } catch (e) { setError((e as Error).message) }
  }, [filter])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500) }

  async function closeToday() {
    if (!data) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/caisse/close", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_type: "jour", period_start: data.today }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      flash("Journée clôturée")
      await load()
    } catch (e) { flash((e as Error).message) } finally { setBusy(false) }
  }

  async function reconcile(c: Cloture) {
    const r = recon[c.id]
    if (!r || r.counted.trim() === "") { flash("Saisis le montant compté"); return }
    const cents = Math.round(parseFloat(r.counted.replace(",", ".")) * 100)
    if (!Number.isFinite(cents) || cents < 0) { flash("Montant invalide"); return }
    setBusy(true)
    try {
      const res = await fetch("/api/admin/caisse/reconcile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, cash_counted_cents: cents, cash_note: r.note || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      flash("Rapprochement enregistré")
      await load()
    } catch (e) { flash((e as Error).message) } finally { setBusy(false) }
  }

  const z = data?.z_today
  const aRapprocher = useMemo(
    () => (data?.clotures || []).filter((c) => c.cash_counted_cents === null),
    [data],
  )

  if (error) return <div style={S.page}><AdminBackButton /><p style={S.err}>{error}</p></div>
  if (!data || !z) return <div style={S.page}><AdminBackButton /><p style={S.muted}>Chargement…</p></div>

  const tm = z.totaux.ttc_par_mode
  const j30 = data.analytics.j30
  const j7 = data.analytics.j7

  return (
    <div style={S.page}>
      <AdminBackButton />
      <h1 style={S.h1}>💶 Caisse</h1>

      {/* Z du jour */}
      <section style={S.card}>
        <div style={S.headRow}>
          <h2 style={S.h2}>Aujourd’hui · {data.today}</h2>
          {data.is_closed
            ? <span style={S.badgeOk}>Clôturé</span>
            : <span style={S.badgeWarn}>Non clôturé</span>}
        </div>
        <Row label="Total TTC" value={euro(z.totaux.ttc)} strong />
        <Row label="Stripe" value={euro(tm.stripe)} />
        <Row label="Wallet" value={euro(tm.wallet)} />
        <Row label="Espèces" value={euro(tm.especes)} />
        <Row label="CB SumUp" value={euro(tm.cb_sumup)} />
        {tm.non_encaisse > 0 && <Row label="Non encaissé" value={euro(tm.non_encaisse)} />}
        <Row label="Espèces attendues" value={euro(z.totaux.especes_attendues)} strong />
        <div style={S.subMeta}>
          {z.precommandes.nb} précommande(s) · {z.comptoir.nb} vente(s) comptoir
          {z.comptoir.nb_annulations > 0 ? ` · ${z.comptoir.nb_annulations} annulation(s)` : ""}
          {z.comptoir.jetons_qty > 0 ? ` · ${z.comptoir.jetons_qty} jeton(s)` : ""}
        </div>
        {!data.is_closed && (
          <button onClick={closeToday} disabled={busy} style={S.primary}>Clôturer maintenant</button>
        )}
      </section>

      {/* Analytique */}
      <h2 style={S.h2b}>Analytique</h2>
      <section style={S.card}>
        <div style={S.split}>
          <div>
            <div style={S.miniLabel}>CA 7 jours</div>
            <div style={S.miniVal}>{euro(j7?.totaux.ttc)}</div>
          </div>
          <div>
            <div style={S.miniLabel}>CA 30 jours</div>
            <div style={S.miniVal}>{euro(j30?.totaux.ttc)}</div>
          </div>
        </div>
        {j30 && (
          <>
            <div style={S.subMeta}>Répartition 30 j — Stripe {euro(j30.totaux.ttc_par_mode.stripe)} · Wallet {euro(j30.totaux.ttc_par_mode.wallet)} · Espèces {euro(j30.totaux.ttc_par_mode.especes)} · CB {euro(j30.totaux.ttc_par_mode.cb_sumup)}</div>
            <Row label="Précommandes 30 j" value={euro(j30.precommandes.par_mode.stripe + j30.precommandes.par_mode.wallet + j30.precommandes.par_mode.especes + j30.precommandes.par_mode.cb_sumup + j30.precommandes.par_mode.non_encaisse)} />
            <Row label="Comptoir 30 j" value={euro(j30.comptoir.par_mode.wallet + j30.comptoir.par_mode.especes + j30.comptoir.par_mode.cb_sumup)} />
            <Row label="Dette wallet (soldes clients)" value={euro(j30.wallet.dette_totale)} />
            <div style={S.miniLabel}>Top 5 articles (30 j)</div>
            {topArticles(j30.articles, 5).map((a) => (
              <div key={a.sku} style={S.artRow}><span>{a.name}</span><span style={S.artQty}>{a.qty} · {euro(a.total_cents)}</span></div>
            ))}
            {j30.articles.length === 0 && <div style={S.muted}>Aucune vente sur 30 jours.</div>}
          </>
        )}
      </section>

      {/* À rapprocher */}
      {aRapprocher.length > 0 && (
        <>
          <h2 style={S.h2b}>À rapprocher ({aRapprocher.length})</h2>
          {aRapprocher.map((c) => (
            <section key={c.id} style={S.card}>
              <div style={S.headRow}>
                <strong>{PERIOD_LABEL[c.period_type]} · {c.period_start}</strong>
                <span style={S.muted}>attendu {euro(c.cash_expected_cents)}</span>
              </div>
              <div style={S.reconRow}>
                <input
                  inputMode="decimal" placeholder="Espèces comptées €"
                  value={recon[c.id]?.counted ?? ""}
                  onChange={(e) => setRecon((s) => ({ ...s, [c.id]: { counted: e.target.value, note: s[c.id]?.note ?? "" } }))}
                  style={S.input}
                />
                <input
                  placeholder="Note (optionnel)"
                  value={recon[c.id]?.note ?? ""}
                  onChange={(e) => setRecon((s) => ({ ...s, [c.id]: { counted: s[c.id]?.counted ?? "", note: e.target.value } }))}
                  style={S.input}
                />
                <button onClick={() => reconcile(c)} disabled={busy} style={S.small}>Valider</button>
              </div>
            </section>
          ))}
        </>
      )}

      {/* Archives */}
      <div style={S.headRow}>
        <h2 style={S.h2b}>Clôtures</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value as "" | PeriodType)} style={S.select}>
          <option value="">Toutes</option>
          <option value="jour">Jour</option>
          <option value="mois">Mois</option>
          <option value="annee">Année</option>
        </select>
      </div>
      {data.clotures.length === 0 && <p style={S.muted}>Aucune clôture pour l’instant.</p>}
      {data.clotures.map((c) => {
        const diff = c.cash_diff_cents
        return (
          <Link key={c.id} href={`/admin/caisse/${c.id}`} style={S.cloRow}>
            <div>
              <strong>{PERIOD_LABEL[c.period_type]}</strong> · {c.period_start}
              <div style={S.subMeta}>TTC {euro(c.data?.totaux?.ttc)} · attendu {euro(c.cash_expected_cents)}</div>
            </div>
            <div style={S.cloRight}>
              {c.cash_counted_cents === null
                ? <span style={S.badgeWarn}>à rapprocher</span>
                : <span style={{ ...S.diff, color: diff === 0 ? "#166534" : "#B45309" }}>
                    {diff === 0 ? "OK" : `${diff! > 0 ? "+" : ""}${euro(diff)}`}
                  </span>}
              <span style={S.chevron}>›</span>
            </div>
          </Link>
        )
      })}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ ...S.row, ...(strong ? S.rowStrong : {}) }}>
      <span>{label}</span><span>{value}</span>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 460, margin: "0 auto", padding: "12px 14px 60px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  h1: { fontSize: 22, fontWeight: 800, margin: "8px 0 12px" },
  h2: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-soft)", margin: 0 },
  h2b: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-soft)", margin: "20px 0 8px" },
  card: { border: "1px solid var(--border)", borderRadius: 14, padding: 14, background: "var(--card, #fff)", marginBottom: 4 },
  headRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  row: { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 15 },
  rowStrong: { fontWeight: 800, borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 8 },
  subMeta: { fontSize: 12, color: "var(--ink-soft)", marginTop: 6 },
  badgeOk: { background: "#E8F5E9", color: "#166534", border: "1px solid #A5D6A7", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 },
  badgeWarn: { background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 },
  primary: { width: "100%", minHeight: 48, marginTop: 12, background: "var(--accent)", color: "#fff", fontWeight: 800, fontSize: 16, border: "none", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" },
  split: { display: "flex", gap: 12 },
  miniLabel: { fontSize: 12, color: "var(--ink-soft)", marginTop: 10, fontWeight: 700 },
  miniVal: { fontSize: 22, fontWeight: 800, color: "var(--accent-2, #5A7F42)" },
  artRow: { display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 },
  artQty: { color: "var(--ink-soft)" },
  reconRow: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 },
  input: { flex: 1, minWidth: 120, height: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" },
  small: { minHeight: 44, padding: "0 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  select: { height: 40, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit", padding: "0 8px" },
  cloRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 8, textDecoration: "none", color: "var(--ink)", background: "var(--card, #fff)" },
  cloRight: { display: "flex", alignItems: "center", gap: 8 },
  diff: { fontWeight: 800, fontSize: 14 },
  chevron: { color: "var(--ink-soft)", fontSize: 22 },
  muted: { color: "var(--ink-soft)", fontSize: 14 },
  err: { color: "#DC2626", fontSize: 14, margin: "8px 0" },
  toast: { position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", background: "#166534", color: "#fff", padding: "10px 18px", borderRadius: 999, fontWeight: 700, zIndex: 50 },
}
