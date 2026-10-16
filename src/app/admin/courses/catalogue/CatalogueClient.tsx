"use client"

import { useEffect, useState } from "react"
import { AdminBackButton } from "../../AdminBackButton"
import { RAYONS, rayonLabel, rayonOrdre } from "@/lib/courses-rayons"

interface Fav { id: string; libelle: string; categorie: string; fournisseur: string | null; unite: string | null; quantite_defaut: number; dernier_prix: number | null; actif: boolean }

export function CatalogueClient() {
  const [favoris, setFavoris] = useState<Fav[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetch("/api/admin/courses/catalogue")
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || "Erreur")
    setFavoris(json.favoris || [])
  }
  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/courses/catalogue")
        const json = await res.json()
        if (annule) return
        if (!res.ok) throw new Error(json.error || "Erreur")
        setFavoris(json.favoris || [])
      } catch (e) { if (!annule) setError((e as Error).message) }
    })()
    return () => { annule = true }
  }, [])

  async function maj(id: string, patch: Record<string, unknown>) {
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/admin/courses/catalogue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const parRayon = new Map<string, Fav[]>()
  for (const f of favoris || []) { const l = parRayon.get(f.categorie) || []; l.push(f); parRayon.set(f.categorie, l) }

  return (
    <div style={S.page}>
      <AdminBackButton />
      <h1 style={S.h1}>Catalogue des courses</h1>
      {error && <p style={S.err}>{error}</p>}
      {!favoris && !error && <p style={S.muted}>Chargement…</p>}
      {[...parRayon.entries()].sort((a, b) => rayonOrdre(a[0]) - rayonOrdre(b[0])).map(([r, fs]) => (
        <div key={r} style={{ marginBottom: 16 }}>
          <h2 style={S.h2}>{rayonLabel(r)}</h2>
          {fs.map((f) => (
            <div key={f.id} style={{ ...S.row, ...(f.actif ? {} : { opacity: 0.5 }) }}>
              <input defaultValue={f.libelle} disabled={busy} style={S.lib}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== f.libelle) maj(f.id, { libelle: v }) }} />
              <select value={f.categorie} disabled={busy} onChange={(e) => maj(f.id, { categorie: e.target.value })} style={S.cat}>
                {RAYONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              <label style={S.sw}>
                <input type="checkbox" checked={f.actif} disabled={busy} onChange={(e) => maj(f.id, { actif: e.target.checked })} />
                {f.actif ? "actif" : "inactif"}
              </label>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 560, margin: "0 auto", padding: "16px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  h1: { fontSize: 22, fontWeight: 800, margin: "12px 0 12px" },
  h2: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-soft)", margin: "8px 0" },
  err: { color: "#DC2626", fontSize: 14 }, muted: { color: "var(--ink-soft)", fontSize: 14 },
  row: { display: "flex", gap: 6, alignItems: "center", marginBottom: 8 },
  lib: { flex: 2, minHeight: 40, padding: "0 8px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" },
  cat: { flex: 1, minHeight: 40, padding: "0 6px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" },
  sw: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ink-soft)", fontWeight: 700, whiteSpace: "nowrap" },
}
