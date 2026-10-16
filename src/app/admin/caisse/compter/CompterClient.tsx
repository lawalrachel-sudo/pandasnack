"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AdminBackButton } from "../../AdminBackButton"
import { ecartCents } from "@/lib/caisse-compter"

interface Jour { id: string; date: string; cash_expected_cents: number; especes_total_cents: number; comptoir_nb: number }

function euro(c: number) { return `${(c / 100).toFixed(2).replace(".", ",")} €` }
function jourLong(iso: string) { return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit" }) }

export function CompterClient() {
  const [jours, setJours] = useState<Jour[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [compte, setCompte] = useState("")   // euros saisis
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function load(): Promise<Jour[]> {
    const res = await fetch("/api/admin/caisse/a-compter")
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || "Erreur")
    const list = (json.jours || []) as Jour[]
    setJours(list)
    return list
  }
  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/caisse/a-compter")
        const json = await res.json()
        if (annule) return
        if (!res.ok) throw new Error(json.error || "Erreur")
        setJours(json.jours || [])
      } catch (e) { if (!annule) setError((e as Error).message) }
    })()
    return () => { annule = true }
  }, [])

  const jour = jours?.[0] || null
  const compteCents = compte === "" ? null : Math.round(Number(compte.replace(",", ".")) * 100)
  const ecart = jour && compteCents != null ? ecartCents(compteCents, jour.cash_expected_cents) : null

  async function valider() {
    if (!jour || compteCents == null || !Number.isFinite(compteCents) || compteCents < 0) return
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/admin/caisse/reconcile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jour.id, cash_counted_cents: compteCents, cash_note: note.trim() || null, firstCountOnly: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setCompte(""); setNote("")
      const reste = await load()
      if (reste.length === 0) setDone(true)  // plus rien → « tout est compté »
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  if (done || (jours && jours.length === 0)) {
    return (
      <div style={S.page}>
        <AdminBackButton />
        <div style={S.allDone}>
          <div style={{ fontSize: 44 }}>✅</div>
          <p style={S.allDoneTxt}>Tout est compté</p>
          <Link href="/admin/home" style={S.cta}>Retour à l’accueil</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      <AdminBackButton />
      <h1 style={S.h1}>💶 Compter la caisse</h1>
      {error && <p style={S.err}>⚠ {error}</p>}
      {!jours && !error && <p style={S.muted}>Chargement…</p>}
      {jours && jours.length > 1 && <p style={S.reste}>{jours.length} journées à compter · la plus ancienne d’abord</p>}

      {jour && (
        <div style={S.card}>
          <div style={S.date}>{jourLong(jour.date)}</div>
          <div style={S.expected}>
            <span style={S.expLabel}>Espèces attendues</span>
            <strong style={S.expVal}>{euro(jour.cash_expected_cents)}</strong>
          </div>
          <p style={S.rappel}>Ventes comptoir du jour : {jour.comptoir_nb} · espèces {euro(jour.especes_total_cents)}</p>

          <label style={S.field}>
            <span style={S.fieldLabel}>Espèces comptées</span>
            <input type="number" inputMode="decimal" step="0.01" value={compte} onChange={(e) => setCompte(e.target.value)}
              placeholder="0,00" style={S.input} autoFocus />
          </label>

          {ecart != null && (
            <div style={{ ...S.ecart, color: ecart === 0 ? "var(--accent-2, #5A7F42)" : "#B45309" }}>
              Écart : {ecart > 0 ? "+" : ""}{euro(ecart)} {ecart === 0 ? "✓" : ecart > 0 ? "(excédent)" : "(manquant)"}
            </div>
          )}

          <label style={S.field}>
            <span style={S.fieldLabel}>Note (facultatif)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="5 € de monnaie prise pour…" style={S.input} />
          </label>

          <button type="button" onClick={valider} disabled={busy || compteCents == null} style={{ ...S.cta, ...((busy || compteCents == null) ? S.ctaOff : {}) }}>
            {busy ? "Validation…" : "Valider"}
          </button>
          <Link href="/admin/home" style={S.plusTard}>Plus tard</Link>
        </div>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 460, margin: "0 auto", padding: "16px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  h1: { fontSize: 22, fontWeight: 800, margin: "12px 0 8px" },
  err: { color: "#DC2626", fontSize: 14 },
  muted: { color: "var(--ink-soft)", fontSize: 14 },
  reste: { fontSize: 13, color: "var(--ink-soft)", margin: "0 0 10px" },
  card: { border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--card, #fff)" },
  date: { fontSize: 16, fontWeight: 800, textTransform: "capitalize", marginBottom: 10 },
  expected: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, padding: "10px 12px", borderRadius: 12, background: "var(--bg-alt)" },
  expLabel: { fontSize: 14, color: "var(--ink-soft)", fontWeight: 600 },
  expVal: { fontSize: 22, fontWeight: 800 },
  rappel: { fontSize: 13, color: "var(--ink-soft)", margin: "8px 0 14px" },
  field: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 },
  fieldLabel: { fontSize: 13, color: "var(--ink-soft)", fontWeight: 600 },
  input: { width: "100%", minHeight: 52, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 20, fontWeight: 700, background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" },
  ecart: { fontSize: 16, fontWeight: 800, margin: "0 0 12px" },
  cta: { display: "block", width: "100%", minHeight: 54, borderRadius: 14, border: "none", background: "var(--accent)", color: "#fff", fontSize: 17, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", textAlign: "center", lineHeight: "54px", textDecoration: "none" },
  ctaOff: { background: "var(--bg-alt)", color: "var(--ink-soft)", cursor: "not-allowed" },
  plusTard: { display: "block", textAlign: "center", color: "var(--ink-soft)", fontSize: 14, fontWeight: 700, marginTop: 12, minHeight: 44, lineHeight: "44px", textDecoration: "none" },
  allDone: { textAlign: "center", marginTop: 40 },
  allDoneTxt: { fontSize: 18, fontWeight: 800, margin: "8px 0 18px" },
}
