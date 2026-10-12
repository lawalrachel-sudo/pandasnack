"use client"

import { useEffect, useState } from "react"
import { AdminBackButton } from "../AdminBackButton"
import { joursLabel, confirmText } from "@/lib/comptes-pandas"

interface Ambigu { prenom: string; nom: string | null; classe: string; jour: string | null }
interface DryRun {
  annee: string | null
  elevesAnnee: number
  comptesExistants: number
  comptesACreer: number
  profilsACreer: number
  ambigus: Ambigu[]
}
interface Resultat { comptesCrees: number; lignesSync: number }

export function ComptesPandasClient() {
  const [dry, setDry] = useState<DryRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resultat, setResultat] = useState<Resultat | null>(null)

  async function loadDryRun() {
    try {
      const res = await fetch("/api/admin/panda-accounts/backfill")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setError(null)
      setDry(json as DryRun)
    } catch (e) { setError((e as Error).message) }
  }

  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/panda-accounts/backfill")
        const json = await res.json()
        if (annule) return
        if (!res.ok) throw new Error(json.error || "Erreur")
        setError(null)
        setDry(json as DryRun)
      } catch (e) { if (!annule) setError((e as Error).message) }
    })()
    return () => { annule = true }
  }, [])

  async function creer() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/panda-accounts/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execute: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setResultat({ comptesCrees: json.comptesCrees ?? 0, lignesSync: json.lignesSync ?? 0 })
      setConfirming(false)
      await loadDryRun()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const rienACreer = !!dry && dry.comptesACreer === 0 && dry.profilsACreer === 0

  return (
    <div style={S.page}>
      <AdminBackButton />
      <h1 style={S.h1}>🐼 Comptes des Pandas</h1>
      <p style={S.intro}>
        Crée les comptes et les profils des Pandas inscrits qui n’en ont pas encore.
        Rien n’est envoyé aux familles.
      </p>

      {error && <p style={S.err}>⚠ {error}</p>}
      {!dry && !error && <p style={S.muted}>Chargement…</p>}

      {dry && (
        <>
          {dry.annee && <p style={S.annee}>Année {dry.annee}</p>}
          <div style={S.stats}>
            <Stat n={dry.elevesAnnee} label="élèves de l’année" />
            <Stat n={dry.comptesExistants} label="comptes déjà là" />
            <Stat n={dry.comptesACreer} label="comptes à créer" strong />
            <Stat n={dry.profilsACreer} label="profils à créer" strong />
          </div>

          {dry.ambigus.length > 0 && (
            <div style={S.block}>
              <h2 style={S.h2}>Inscrits sur deux jours</h2>
              {dry.ambigus.map((a, i) => (
                <div key={i} style={S.ambRow}>
                  <span style={S.ambNom}>{a.prenom}{a.nom ? ` ${a.nom}` : ""}</span>
                  <span style={S.ambJour}>{joursLabel(a.classe)}</span>
                </div>
              ))}
              <p style={S.note}>Commandables les deux jours.</p>
            </div>
          )}

          {resultat && (
            <div style={S.ok} role="status">
              ✅ {resultat.comptesCrees} compte{resultat.comptesCrees > 1 ? "s" : ""} créé{resultat.comptesCrees > 1 ? "s" : ""}
              {" · "}{resultat.lignesSync} ligne{resultat.lignesSync > 1 ? "s" : ""} synchronisée{resultat.lignesSync > 1 ? "s" : ""}.
            </div>
          )}

          {rienACreer ? (
            <>
              <p style={S.allGood}>Tous les Pandas inscrits ont leur compte.</p>
              <button style={{ ...S.cta, ...S.ctaOff }} disabled>Créer les comptes</button>
            </>
          ) : (
            <button style={S.cta} onClick={() => setConfirming(true)}>
              Créer les comptes ({dry.comptesACreer})
            </button>
          )}
        </>
      )}

      {confirming && dry && (
        <div style={S.overlay} role="dialog" aria-modal="true">
          <div style={S.sheet}>
            <p style={S.sheetText}>{confirmText(dry.comptesACreer, dry.profilsACreer)}</p>
            <button style={S.cta} onClick={creer} disabled={busy}>
              {busy ? "Création…" : "Oui, créer"}
            </button>
            <button style={S.cancel} onClick={() => setConfirming(false)} disabled={busy}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ n, label, strong }: { n: number; label: string; strong?: boolean }) {
  return (
    <div style={{ ...S.stat, ...(strong ? S.statStrong : {}) }}>
      <span style={S.statN}>{n}</span>
      <span style={S.statLabel}>{label}</span>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 460, margin: "0 auto", padding: "16px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  h1: { fontSize: 22, fontWeight: 800, margin: "12px 0 8px" },
  intro: { fontSize: 14, color: "var(--ink-soft)", margin: "0 0 14px", lineHeight: 1.5 },
  annee: { fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", margin: "0 0 10px" },
  err: { color: "#DC2626", fontSize: 14 },
  muted: { color: "var(--ink-soft)", fontSize: 14 },
  stats: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 },
  stat: { border: "1px solid var(--border)", borderRadius: 14, padding: "14px 12px", background: "var(--card, #fff)", display: "flex", flexDirection: "column", gap: 2 },
  statStrong: { borderColor: "var(--accent)", background: "#FBF0EA" },
  statN: { fontSize: 26, fontWeight: 800, color: "var(--ink)" },
  statLabel: { fontSize: 13, color: "var(--ink-soft)" },
  block: { marginTop: 16 },
  h2: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-soft)", margin: "0 0 8px" },
  ambRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", marginBottom: 8, background: "var(--card, #fff)" },
  ambNom: { fontWeight: 700, fontSize: 15 },
  ambJour: { fontSize: 13, color: "var(--accent)", fontWeight: 700 },
  note: { fontSize: 12, color: "var(--ink-soft)", margin: "2px 0 0" },
  ok: { marginTop: 16, border: "1px solid var(--accent-2, #5A7F42)", background: "#EEF4E8", color: "var(--ink)", borderRadius: 14, padding: "12px 14px", fontSize: 14, fontWeight: 600 },
  allGood: { marginTop: 18, fontSize: 15, fontWeight: 700, color: "var(--accent-2, #5A7F42)" },
  cta: { width: "100%", minHeight: 54, marginTop: 18, borderRadius: 14, border: "none", background: "var(--accent)", color: "#fff", fontSize: 17, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" },
  ctaOff: { background: "var(--bg-alt)", color: "var(--ink-soft)", cursor: "not-allowed" },
  cancel: { width: "100%", minHeight: 48, marginTop: 10, borderRadius: 14, border: "1px solid var(--border)", background: "var(--card, #fff)", color: "var(--ink)", fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(40,28,20,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, padding: 12 },
  sheet: { width: "100%", maxWidth: 460, background: "var(--card, #fff)", borderRadius: 18, padding: "18px 16px calc(18px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 20px 60px rgba(200,90,60,.2)" },
  sheetText: { fontSize: 15, lineHeight: 1.5, margin: "0 0 6px", color: "var(--ink)" },
}
