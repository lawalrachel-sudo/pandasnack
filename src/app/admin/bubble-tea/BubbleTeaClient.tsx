"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { AdminBackButton } from "../AdminBackButton"
import { conditionnementsFor, fmtStock, type BubbleKind } from "@/lib/bubble-stock"

interface StockRow {
  option_id: string; kind: BubbleKind; name: string; active: boolean
  unite: string; dose: number | null; seuil_doses: number
  stock: number; doses_restantes: number | null; alerte: boolean | null
}

export function BubbleTeaClient() {
  const [rows, setRows] = useState<StockRow[] | null>(null)
  const [dansListe, setDansListe] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [invFor, setInvFor] = useState<string | null>(null)
  const [invVal, setInvVal] = useState("")
  const [newName, setNewName] = useState<{ sirop: string; perles: string; the: string }>({ sirop: "", perles: "", the: "" })

  async function load() {
    try {
      const res = await fetch("/api/admin/bubble-tea")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setRows(json.options || []); setDansListe(json.dansListe || [])
    } catch (e) { setError((e as Error).message) }
  }
  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/bubble-tea")
        const json = await res.json()
        if (annule) return
        if (!res.ok) throw new Error(json.error || "Erreur")
        setRows(json.options || []); setDansListe(json.dansListe || [])
      } catch (e) { if (!annule) setError((e as Error).message) }
    })()
    return () => { annule = true }
  }, [])

  async function act(body: Record<string, unknown>) {
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/admin/bubble-tea", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      await load()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  // Section sirop/perles (stock suivi).
  function stockSection(kind: BubbleKind, title: string) {
    const list = (rows || []).filter((r) => r.kind === kind)
    return (
      <div style={S.block}>
        <h2 style={S.h2}>{title}</h2>
        {list.map((r) => (
          <div key={r.option_id} style={{ ...S.card, ...(r.active ? {} : S.cardOff) }}>
            <div style={S.cardTop}>
              <span style={S.nom}>{r.name}</span>
              <label style={S.switch}>
                <input type="checkbox" checked={r.active} disabled={busy} onChange={(e) => act({ action: "toggle", id: r.option_id, active: e.target.checked })} />
                <span style={S.switchLbl}>{r.active ? "Actif" : "Inactif"}</span>
              </label>
            </div>
            <div style={S.stockRow}>
              <span>{fmtStock(r.stock, r.unite, r.dose || 1)}</span>
              {r.alerte && <span style={S.badge}>⚠ sous le seuil ({r.seuil_doses})</span>}
            </div>
            <div style={S.actions}>
              {conditionnementsFor(kind).map((c) => (
                <button key={c.key} disabled={busy} style={S.reassort} onClick={() => act({ action: "reassort", id: r.option_id, base: c.base, note: `+ ${c.label}` })}>
                  + {c.label}
                </button>
              ))}
              <button disabled={busy} style={S.inv} onClick={() => { setInvFor(invFor === r.option_id ? null : r.option_id); setInvVal("") }}>
                Inventaire
              </button>
            </div>
            {invFor === r.option_id && (
              <div style={S.invRow}>
                <input type="number" inputMode="numeric" value={invVal} onChange={(e) => setInvVal(e.target.value)}
                  placeholder={`Stock réel compté (${r.unite})`} style={S.input} />
                <button disabled={busy || invVal === ""} style={S.invOk}
                  onClick={async () => { await act({ action: "inventaire", id: r.option_id, reel_base: Number(invVal) }); setInvFor(null) }}>
                  Valider
                </button>
              </div>
            )}
          </div>
        ))}
        <div style={S.addRow}>
          <input value={newName[kind]} onChange={(e) => setNewName((n) => ({ ...n, [kind]: e.target.value }))}
            placeholder={kind === "sirop" ? "Nouveau parfum" : "Nouvelle bubble"} style={S.input} />
          <button disabled={busy || !newName[kind].trim()} style={S.add}
            onClick={async () => { await act({ action: "create", kind, name: newName[kind] }); setNewName((n) => ({ ...n, [kind]: "" })) }}>
            + {kind === "sirop" ? "Parfum" : "Bubble"}
          </button>
        </div>
      </div>
    )
  }

  const thes = (rows || []).filter((r) => r.kind === "the")
  // À racheter : options sirop/perles sous le seuil.
  const aRacheter = (rows || []).filter((r) => (r.kind === "sirop" || r.kind === "perles") && r.doses_restantes != null && r.doses_restantes < r.seuil_doses)

  return (
    <div style={S.page}>
      <AdminBackButton />
      <h1 style={S.h1}>🧋 Bubble Tea</h1>
      <p style={S.intro}>Stock estimé par parfum et par bubble (−1 dose à chaque Bubble Tea vendu). Corrige par un inventaire quand tu comptes. Le thé n’est pas suivi : coupe-le s’il n’y en a plus.</p>
      {error && <p style={S.err}>⚠ {error}</p>}
      {!rows && !error && <p style={S.muted}>Chargement…</p>}

      {/* 🛒 À racheter */}
      {rows && (
        <div style={S.block}>
          <h2 style={S.h2}>🛒 À racheter</h2>
          {aRacheter.length === 0 && <p style={S.muted}>Rien à racheter 🧋</p>}
          {aRacheter.map((r) => {
            const inList = dansListe.includes(r.option_id)
            return (
              <div key={r.option_id} style={S.rachat}>
                <span style={S.rachatNom}>{r.kind === "sirop" ? "Sirop" : "Perles"} {r.name}</span>
                <span style={S.rachatDoses}>{r.doses_restantes} dose(s)</span>
                {inList
                  ? <span style={S.dejaListe}>déjà dans la liste</span>
                  : <button disabled={busy} style={S.rachatBtn} onClick={() => act({ action: "courses_add", id: r.option_id })}>Ajouter à la liste</button>}
              </div>
            )
          })}
          {aRacheter.some((r) => !dansListe.includes(r.option_id)) && (
            <button disabled={busy} style={S.toutAjouter} onClick={() => act({ action: "courses_add_all" })}>Tout ajouter à la liste</button>
          )}
        </div>
      )}

      {rows && stockSection("sirop", "Parfums (sirop · 30 ml/dose)")}
      {rows && stockSection("perles", "Bubbles (perles · 78 g/dose)")}

      {/* Thé : dispo à la main, pas de stock */}
      {rows && (
        <div style={S.block}>
          <h2 style={S.h2}>Thé (noir / vert · dispo à la main)</h2>
          {thes.map((r) => (
            <div key={r.option_id} style={{ ...S.card, ...(r.active ? {} : S.cardOff) }}>
              <div style={S.cardTop}>
                <span style={S.nom}>{r.name}</span>
                <label style={S.switch}>
                  <input type="checkbox" checked={r.active} disabled={busy} onChange={(e) => act({ action: "toggle", id: r.option_id, active: e.target.checked })} />
                  <span style={S.switchLbl}>{r.active ? "Disponible" : "Épuisé"}</span>
                </label>
              </div>
            </div>
          ))}
          <div style={S.addRow}>
            <input value={newName.the} onChange={(e) => setNewName((n) => ({ ...n, the: e.target.value }))} placeholder="Nouveau thé" style={S.input} />
            <button disabled={busy || !newName.the.trim()} style={S.add}
              onClick={async () => { await act({ action: "create", kind: "the", name: newName.the }); setNewName((n) => ({ ...n, the: "" })) }}>
              + Thé
            </button>
          </div>
        </div>
      )}

      <p style={{ marginTop: 18 }}>
        <Link href="/admin/bubble-tea/historique" style={S.histLink}>Historique des mouvements →</Link>
      </p>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 460, margin: "0 auto", padding: "16px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  h1: { fontSize: 22, fontWeight: 800, margin: "12px 0 8px" },
  intro: { fontSize: 14, color: "var(--ink-soft)", margin: "0 0 14px", lineHeight: 1.5 },
  err: { color: "#DC2626", fontSize: 14 },
  muted: { color: "var(--ink-soft)", fontSize: 14 },
  block: { marginBottom: 18 },
  h2: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-soft)", margin: "16px 0 8px" },
  card: { border: "1px solid var(--border)", borderRadius: 14, padding: 12, marginBottom: 10, background: "var(--card, #fff)" },
  cardOff: { opacity: 0.55 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  nom: { fontWeight: 800, fontSize: 16 },
  switch: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-soft)" },
  switchLbl: { fontWeight: 700 },
  stockRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 14, marginTop: 6 },
  badge: { fontSize: 12, fontWeight: 700, color: "#DC2626", background: "#FDECEC", borderRadius: 8, padding: "2px 8px" },
  actions: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 },
  reassort: { minHeight: 40, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontSize: 13, fontWeight: 700, fontFamily: "inherit", padding: "0 12px", cursor: "pointer" },
  inv: { minHeight: 40, borderRadius: 10, border: "1px solid var(--accent)", background: "#FBF0EA", color: "var(--accent)", fontSize: 13, fontWeight: 700, fontFamily: "inherit", padding: "0 12px", cursor: "pointer" },
  invRow: { display: "flex", gap: 8, marginTop: 8 },
  invOk: { minHeight: 44, borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: "inherit", padding: "0 16px", cursor: "pointer" },
  input: { flex: 1, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" },
  addRow: { display: "flex", gap: 8, marginTop: 4 },
  add: { minHeight: 44, borderRadius: 10, border: "1px solid var(--border)", background: "var(--card,#fff)", color: "var(--accent)", fontSize: 14, fontWeight: 800, fontFamily: "inherit", padding: "0 14px", cursor: "pointer" },
  rachat: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", marginBottom: 8, background: "var(--card,#fff)" },
  rachatNom: { fontWeight: 700, fontSize: 15, flex: 1 },
  rachatDoses: { fontSize: 13, color: "#DC2626", fontWeight: 700 },
  rachatBtn: { minHeight: 40, borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit", padding: "0 12px", cursor: "pointer" },
  dejaListe: { fontSize: 12, color: "var(--ink-soft)", fontStyle: "italic" },
  toutAjouter: { width: "100%", minHeight: 44, marginTop: 4, borderRadius: 12, border: "1px solid var(--accent)", background: "#FBF0EA", color: "var(--accent)", fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" },
  histLink: { color: "var(--ink-soft)", fontSize: 13, textDecoration: "underline" },
}
