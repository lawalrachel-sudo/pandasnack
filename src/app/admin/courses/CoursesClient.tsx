"use client"

import { useEffect, useState } from "react"
import { AdminBackButton } from "../AdminBackButton"

interface Ligne {
  id: string; libelle: string; quantite: number; unite: string | null
  source: "auto_bubble" | "manuel"; statut: string; created_at: string; updated_at?: string
}

export function CoursesClient() {
  const [sug, setSug] = useState<Ligne[]>([])
  const [aAcheter, setAAcheter] = useState<Ligne[]>([])
  const [achetes, setAchetes] = useState<Ligne[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAchetes, setShowAchetes] = useState(false)
  const [mLib, setMLib] = useState(""); const [mQte, setMQte] = useState(""); const [mUnite, setMUnite] = useState("")
  const [copied, setCopied] = useState(false)

  async function load() {
    try {
      const res = await fetch("/api/admin/courses")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setSug(json.suggestions || []); setAAcheter(json.aAcheter || []); setAchetes(json.achetes || []); setLoaded(true)
    } catch (e) { setError((e as Error).message) }
  }
  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/courses")
        const json = await res.json()
        if (annule) return
        if (!res.ok) throw new Error(json.error || "Erreur")
        setSug(json.suggestions || []); setAAcheter(json.aAcheter || []); setAchetes(json.achetes || []); setLoaded(true)
      } catch (e) { if (!annule) setError((e as Error).message) }
    })()
    return () => { annule = true }
  }, [])

  async function act(body: Record<string, unknown>) {
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/admin/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      await load()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  function ligneTexte(l: Ligne) { return `${l.quantite > 1 ? `${l.quantite} × ` : ""}${l.libelle}${l.unite ? ` (${l.unite})` : ""}` }
  async function partager() {
    const txt = aAcheter.map(ligneTexte).join("\n")
    try { await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  return (
    <div style={S.page}>
      <AdminBackButton />
      <h1 style={S.h1}>🛒 Courses</h1>
      {error && <p style={S.err}>⚠ {error}</p>}
      {!loaded && !error && <p style={S.muted}>Chargement…</p>}

      {/* Ajouter un article manuel */}
      <div style={S.addBox}>
        <input value={mLib} onChange={(e) => setMLib(e.target.value)} placeholder="Ajouter un article" style={{ ...S.input, flex: 2 }} />
        <input type="number" inputMode="decimal" value={mQte} onChange={(e) => setMQte(e.target.value)} placeholder="Qté" style={{ ...S.input, width: 64 }} />
        <input value={mUnite} onChange={(e) => setMUnite(e.target.value)} placeholder="unité" style={{ ...S.input, width: 90 }} />
        <button disabled={busy || !mLib.trim()} style={S.addBtn}
          onClick={async () => { await act({ action: "manuel", libelle: mLib, quantite: mQte, unite: mUnite }); setMLib(""); setMQte(""); setMUnite("") }}>+</button>
      </div>

      {/* Suggestions */}
      {loaded && sug.length > 0 && (
        <div style={S.block}>
          <h2 style={S.h2}>Suggestions</h2>
          {sug.map((l) => (
            <div key={l.id} style={S.row}>
              <span style={S.lib}>{ligneTexte(l)}</span>
              <button disabled={busy} style={S.ok} onClick={() => act({ action: "valider", id: l.id })}>✔</button>
              <button disabled={busy} style={S.no} onClick={() => act({ action: "ignorer", id: l.id })}>✖</button>
            </div>
          ))}
        </div>
      )}

      {/* À acheter */}
      <div style={S.block}>
        <div style={S.blockHead}>
          <h2 style={S.h2}>À acheter ({aAcheter.length})</h2>
          {aAcheter.length > 0 && <button style={S.partager} onClick={partager}>{copied ? "Copié ✓" : "Partager"}</button>}
        </div>
        {loaded && aAcheter.length === 0 && <p style={S.muted}>Rien à acheter.</p>}
        {aAcheter.map((l) => (
          <div key={l.id} style={S.row}>
            <label style={S.check}>
              <input type="checkbox" disabled={busy} onChange={() => act({ action: "achete", id: l.id })} />
              <span style={S.lib}>{ligneTexte(l)}</span>
            </label>
            <input type="number" inputMode="decimal" defaultValue={l.quantite} style={S.qteInput}
              onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== l.quantite) act({ action: "quantite", id: l.id, quantite: v }) }} />
          </div>
        ))}
      </div>

      {/* Acheté (7 j) */}
      {loaded && achetes.length > 0 && (
        <div style={S.block}>
          <button style={S.achHead} onClick={() => setShowAchetes((v) => !v)}>Acheté — 7 derniers jours ({achetes.length}) {showAchetes ? "▴" : "▾"}</button>
          {showAchetes && achetes.map((l) => (
            <div key={l.id} style={{ ...S.row, opacity: 0.6 }}><span style={S.lib}>✓ {ligneTexte(l)}</span></div>
          ))}
        </div>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 460, margin: "0 auto", padding: "16px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  h1: { fontSize: 22, fontWeight: 800, margin: "12px 0 10px" },
  err: { color: "#DC2626", fontSize: 14 },
  muted: { color: "var(--ink-soft)", fontSize: 14 },
  addBox: { display: "flex", gap: 6, marginBottom: 14 },
  input: { minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" },
  addBtn: { minWidth: 44, minHeight: 44, borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontSize: 22, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" },
  block: { marginBottom: 18 },
  blockHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  h2: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-soft)", margin: "10px 0 8px" },
  partager: { minHeight: 36, borderRadius: 10, border: "1px solid var(--border)", background: "var(--card,#fff)", color: "var(--accent)", fontSize: 13, fontWeight: 700, fontFamily: "inherit", padding: "0 12px", cursor: "pointer" },
  row: { display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", marginBottom: 8, background: "var(--card,#fff)" },
  check: { display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: "pointer" },
  lib: { fontSize: 15, fontWeight: 600, flex: 1 },
  qteInput: { width: 60, minHeight: 40, padding: "0 8px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" },
  ok: { minWidth: 44, minHeight: 40, borderRadius: 10, border: "none", background: "var(--accent-2, #5A7F42)", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer" },
  no: { minWidth: 44, minHeight: 40, borderRadius: 10, border: "1px solid var(--border)", background: "var(--card,#fff)", color: "var(--ink-soft)", fontSize: 16, cursor: "pointer" },
  achHead: { width: "100%", textAlign: "left", background: "none", border: "none", padding: "8px 0", fontSize: 13, fontWeight: 800, color: "var(--ink-soft)", cursor: "pointer", fontFamily: "inherit" },
}
