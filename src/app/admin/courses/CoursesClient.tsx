"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AdminBackButton } from "../AdminBackButton"
import { RAYONS, rayonLabel, rayonOrdre, pilules } from "@/lib/courses-rayons"

interface Item {
  id: string; libelle: string; quantite: number; unite: string | null
  source: string; bubble_option_id: string | null; categorie: string; fournisseur: string | null
  statut: string; archived_at: string | null
}
interface Fav { id: string; libelle: string; categorie: string; fournisseur: string | null; unite: string | null; quantite_defaut: number }

type Undo = { label: string; run: () => Promise<void> } | null

export function CoursesClient() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [retires, setRetires] = useState<Item[]>([])
  const [historique, setHistorique] = useState<Item[]>([])
  const [catalogue, setCatalogue] = useState<Fav[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [filtre, setFiltre] = useState<string | null>(null)
  const [undo, setUndo] = useState<Undo>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [showRetires, setShowRetires] = useState(false)
  const [showHisto, setShowHisto] = useState(false)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load() {
    const res = await fetch("/api/admin/courses")
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || "Erreur")
    setItems(json.items || []); setRetires(json.retires || []); setHistorique(json.historique || []); setCatalogue(json.catalogue || [])
  }
  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/courses")
        const json = await res.json()
        if (annule) return
        if (!res.ok) throw new Error(json.error || "Erreur")
        setItems(json.items || []); setRetires(json.retires || []); setHistorique(json.historique || []); setCatalogue(json.catalogue || [])
      } catch (e) { if (!annule) setError((e as Error).message) }
    })()
    return () => { annule = true }
  }, [])

  async function act(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || "Erreur")
    return json
  }
  async function run(body: Record<string, unknown>, undoAction?: Undo) {
    setBusy(true); setError(null)
    try { await act(body); await load(); if (undoAction !== undefined) armUndo(undoAction) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  function armUndo(u: Undo) {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndo(u)
    if (u) undoTimer.current = setTimeout(() => setUndo(null), 5000)
  }

  const actifs = items || []
  const vus = filtre ? actifs.filter((i) => i.categorie === filtre) : actifs
  const tri = [...vus].sort((a, b) => rayonOrdre(a.categorie) - rayonOrdre(b.categorie))
  const coche = (i: Item) => i.statut === "achete"
  const { tout, rayons } = useMemo(() => pilules(actifs.map((i) => ({ id: i.id, categorie: i.categorie, coche: coche(i) }))), [actifs])
  const nbRayons = new Set(actifs.filter((i) => !coche(i)).map((i) => i.categorie)).size

  function cocher(i: Item) {
    run({ action: "achete", id: i.id }, { label: `${i.libelle} coché`, run: async () => { await act({ action: "decocher", id: i.id, reverse: true }); await load() } })
  }
  function decocher(i: Item) { run({ action: "decocher", id: i.id, reverse: false }) }
  function step(i: Item, delta: number) {
    const q = i.quantite + delta
    if (q < 1) { run({ action: "retirer", id: i.id }, { label: `${i.libelle} retiré`, run: async () => { await act({ action: "remettre", id: i.id, quantite: i.quantite }); await load() } }); return }
    run({ action: "quantite", id: i.id, quantite: q })
  }
  function terminer() {
    const ids = actifs.filter(coche).map((i) => i.id)
    if (ids.length === 0) return
    run({ action: "terminer" }, { label: `${ids.length} article(s) rangé(s)`, run: async () => { for (const id of ids) await act({ action: "decocher", id, reverse: false }); await load() } })
  }

  function partager() {
    const parRayon = new Map<string, Item[]>()
    for (const i of actifs.filter((x) => !coche(x))) { const l = parRayon.get(i.categorie) || []; l.push(i); parRayon.set(i.categorie, l) }
    const txt = [...parRayon.entries()].sort((a, b) => rayonOrdre(a[0]) - rayonOrdre(b[0]))
      .map(([r, ls]) => `${rayonLabel(r)}\n` + ls.map((i) => `- ${i.quantite > 1 ? `${i.quantite} ` : ""}${i.libelle}${i.unite ? ` (${i.unite})` : ""}`).join("\n")).join("\n\n")
    navigator.clipboard?.writeText(txt).catch(() => {})
  }

  if (error) return <div style={S.page}><AdminBackButton /><p style={S.err}>{error}</p></div>
  if (!items) return <div style={S.page}><AdminBackButton /><p style={S.muted}>Chargement…</p></div>

  return (
    <div style={S.page}>
      <AdminBackButton />
      <h1 style={S.h1}>Courses</h1>
      <p style={S.count}>{tout} articles · {nbRayons} rayon{nbRayons > 1 ? "s" : ""}</p>

      {/* Pilules rayon */}
      <div style={S.pills}>
        <button onClick={() => setFiltre(null)} style={{ ...S.pill, ...(filtre === null ? S.pillOn : {}) }}>Tout ({tout})</button>
        {rayons.map((r) => (
          <button key={r.key} onClick={() => setFiltre(r.key)} disabled={r.restants === 0}
            style={{ ...S.pill, ...(filtre === r.key ? S.pillOn : {}), ...(r.restants === 0 ? S.pillOff : {}) }}>
            {r.label} ({r.restants})
          </button>
        ))}
      </div>

      {/* Cartes 2 colonnes */}
      <div style={S.grid}>
        {tri.map((i) => (
          <div key={i.id} style={{ ...S.card, ...(coche(i) ? S.cardDone : {}) }}>
            <label style={S.cardTop}>
              <input type="checkbox" checked={coche(i)} disabled={busy}
                onChange={(e) => e.target.checked ? cocher(i) : decocher(i)} style={S.check} />
              <span style={S.lib}>{i.libelle}{i.source === "auto_bubble" && <span style={S.auto}> auto</span>}</span>
            </label>
            {i.fournisseur && <span style={S.four}>{i.fournisseur}</span>}
            {!coche(i) && (
              <div style={S.stepper}>
                <button onClick={() => step(i, -1)} disabled={busy} style={S.stepBtn} aria-label="moins">−</button>
                <span style={S.qte}>{i.quantite}{i.unite ? <span style={S.unite}> {i.unite}</span> : null}</span>
                <button onClick={() => step(i, +1)} disabled={busy} style={S.stepBtn} aria-label="plus">+</button>
              </div>
            )}
          </div>
        ))}
        {tri.length === 0 && <p style={S.muted}>Rien à acheter ici.</p>}
      </div>

      <button onClick={partager} style={S.partager}>Partager la liste</button>
      <button onClick={terminer} disabled={busy || actifs.filter(coche).length === 0} style={S.terminer}>
        Terminer les courses ({actifs.filter(coche).length})
      </button>

      <div style={S.liens}>
        {retires.length > 0 && <button style={S.lien} onClick={() => setShowRetires((v) => !v)}>Retirés ({retires.length})</button>}
        <button style={S.lien} onClick={() => setShowHisto((v) => !v)}>Historique 7 j</button>
        <Link href="/admin/courses/catalogue" style={S.lien}>Catalogue</Link>
      </div>
      {showRetires && retires.map((i) => (
        <div key={i.id} style={S.ligneMini}><span>{i.libelle}</span>
          <button style={S.remettre} disabled={busy} onClick={() => run({ action: "remettre", id: i.id })}>Remettre</button></div>
      ))}
      {showHisto && historique.map((i) => <div key={i.id} style={{ ...S.ligneMini, opacity: 0.6 }}><span>{i.libelle}</span></div>)}

      {/* FAB ajouter */}
      <button onClick={() => setAddOpen(true)} style={S.fab} aria-label="Ajouter un article">+</button>

      {addOpen && <AddPanel catalogue={catalogue} busy={busy} onClose={() => setAddOpen(false)}
        onPick={(id) => run({ action: "from_catalogue", catalogue_id: id })}
        onFree={(libelle, categorie, unite) => run({ action: "manuel", libelle, categorie, unite })} />}

      {/* Bandeau annuler */}
      {undo && (
        <div style={S.undoBar}>
          <span>{undo.label}</span>
          <button style={S.undoBtn} disabled={busy} onClick={async () => { setBusy(true); try { await undo.run() } finally { setBusy(false); setUndo(null) } }}>Annuler</button>
        </div>
      )}
    </div>
  )
}

function AddPanel({ catalogue, busy, onClose, onPick, onFree }: {
  catalogue: Fav[]; busy: boolean; onClose: () => void
  onPick: (id: string) => void; onFree: (libelle: string, categorie: string, unite: string) => void
}) {
  const [q, setQ] = useState("")
  const [lib, setLib] = useState(""); const [cat, setCat] = useState("autre"); const [unite, setUnite] = useState("")
  const needle = q.trim().toLowerCase()
  const filtered = catalogue.filter((f) => !needle || f.libelle.toLowerCase().includes(needle))
  const parRayon = new Map<string, Fav[]>()
  for (const f of filtered) { const l = parRayon.get(f.categorie) || []; l.push(f); parRayon.set(f.categorie, l) }
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={S.sheetHead}><strong>Ajouter un article</strong><button onClick={onClose} style={S.close}>×</button></div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher dans les favoris" style={S.input} />
        <div style={S.favList}>
          {[...parRayon.entries()].sort((a, b) => rayonOrdre(a[0]) - rayonOrdre(b[0])).map(([r, fs]) => (
            <div key={r}>
              <p style={S.favRayon}>{rayonLabel(r)}</p>
              {fs.map((f) => <button key={f.id} disabled={busy} style={S.favBtn} onClick={() => { onPick(f.id); onClose() }}>{f.libelle}</button>)}
            </div>
          ))}
        </div>
        <div style={S.freeBox}>
          <p style={S.favRayon}>Saisie libre</p>
          <input value={lib} onChange={(e) => setLib(e.target.value)} placeholder="Libellé" style={S.input} />
          <select value={cat} onChange={(e) => setCat(e.target.value)} style={S.input}>
            {RAYONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <input value={unite} onChange={(e) => setUnite(e.target.value)} placeholder="Unité (lot, kg…)" style={S.input} />
          <button disabled={busy || !lib.trim()} style={S.addBtn} onClick={() => { onFree(lib.trim(), cat, unite.trim()); onClose() }}>Ajouter</button>
        </div>
      </div>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 560, margin: "0 auto", padding: "16px 14px 90px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  h1: { fontSize: 22, fontWeight: 800, margin: "12px 0 2px" },
  count: { fontSize: 13, color: "var(--ink-soft)", margin: "0 0 10px" },
  err: { color: "#DC2626", fontSize: 14 }, muted: { color: "var(--ink-soft)", fontSize: 14 },
  pills: { position: "sticky", top: "env(safe-area-inset-top, 0px)", zIndex: 10, display: "flex", gap: 8, overflowX: "auto", padding: "6px 0", background: "var(--bg)", marginBottom: 10 },
  pill: { flex: "0 0 auto", minHeight: 40, padding: "0 14px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--card,#fff)", color: "var(--ink)", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" },
  pillOn: { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" },
  pillOff: { opacity: 0.4, cursor: "not-allowed" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  card: { border: "1px solid var(--border)", borderRadius: 14, padding: 10, background: "var(--card,#fff)", display: "flex", flexDirection: "column", gap: 6 },
  cardDone: { opacity: 0.5, background: "var(--bg-alt)" },
  cardTop: { display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" },
  check: { width: 24, height: 24, flex: "0 0 auto", marginTop: 2, accentColor: "var(--accent)" },
  lib: { fontSize: 14, fontWeight: 700, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  auto: { fontSize: 10, fontWeight: 700, color: "var(--accent)" },
  four: { fontSize: 11, color: "var(--ink-soft)" },
  stepper: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginTop: "auto" },
  stepBtn: { width: 40, height: 40, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontSize: 20, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  qte: { fontSize: 15, fontWeight: 800 }, unite: { fontSize: 11, fontWeight: 600, color: "var(--ink-soft)" },
  partager: { width: "100%", minHeight: 46, marginTop: 16, borderRadius: 12, border: "1px solid var(--border)", background: "var(--card,#fff)", color: "var(--ink)", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" },
  terminer: { width: "100%", minHeight: 52, marginTop: 10, borderRadius: 14, border: "none", background: "var(--accent-2, #5A7F42)", color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" },
  liens: { display: "flex", gap: 16, justifyContent: "center", marginTop: 14 },
  lien: { background: "none", border: "none", color: "var(--ink-soft)", fontSize: 13, fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" },
  ligneMini: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 2px", borderBottom: "1px solid var(--border)", fontSize: 14 },
  remettre: { minHeight: 36, borderRadius: 8, border: "1px solid var(--accent)", background: "#FBF0EA", color: "var(--accent)", fontSize: 13, fontWeight: 700, padding: "0 12px", cursor: "pointer", fontFamily: "inherit" },
  fab: { position: "fixed", right: "calc(16px + env(safe-area-inset-right, 0px))", bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", width: 58, height: 58, borderRadius: 999, border: "none", background: "var(--accent)", color: "#fff", fontSize: 30, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(200,90,60,.35)", zIndex: 20 },
  overlay: { position: "fixed", inset: 0, background: "rgba(40,28,20,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 40, padding: 12 },
  sheet: { width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", background: "var(--card,#fff)", borderRadius: 18, padding: "16px 16px calc(16px + env(safe-area-inset-bottom, 0px))" },
  sheetHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  close: { background: "none", border: "none", fontSize: 26, cursor: "pointer", color: "var(--ink-soft)" },
  input: { width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit", marginBottom: 8 },
  favList: { marginBottom: 10 },
  favRayon: { fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "var(--ink-soft)", margin: "8px 0 4px" },
  favBtn: { display: "block", width: "100%", textAlign: "left", minHeight: 42, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontSize: 14, fontWeight: 600, padding: "0 12px", marginBottom: 6, cursor: "pointer", fontFamily: "inherit" },
  freeBox: { borderTop: "1px solid var(--border)", paddingTop: 10 },
  addBtn: { width: "100%", minHeight: 48, borderRadius: 12, border: "none", background: "var(--accent)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  undoBar: { position: "fixed", left: 12, right: 12, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", maxWidth: 480, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "var(--ink)", color: "#fff", borderRadius: 12, padding: "10px 14px", zIndex: 30 },
  undoBtn: { background: "none", border: "none", color: "#FFB38A", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
}
