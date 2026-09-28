"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AdminBackButton } from "../../AdminBackButton"

interface Article {
  id: string; sku: string; name: string; price_alone_cents: number; stock_qty: number | null
  is_special: boolean; active: boolean; allergens: string[]; parent_id?: string | null
  image_url?: string | null; is_hero?: boolean; hero_text?: string | null; jeton_price?: number | null
}

function euro(c: number) { return `${(c / 100).toFixed(2).replace(".", ",")} €` }

export function CatalogueClient() {
  const [articles, setArticles] = useState<Article[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Article | null>(null)
  const [creating, setCreating] = useState(false)
  const [nName, setNName] = useState(""); const [nPrice, setNPrice] = useState(""); const [nStock, setNStock] = useState("")
  const [busy, setBusy] = useState(false)
  // Ajout de variante : parentId → brouillon.
  const [variantFor, setVariantFor] = useState<string | null>(null)
  const [vName, setVName] = useState(""); const [vStock, setVStock] = useState("")

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/admin/boutique/catalogue")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setArticles(json.articles || [])
    } catch (e) { setError((e as Error).message) }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const parents = useMemo(() => articles.filter((a) => !a.parent_id), [articles])
  const variantsOf = useCallback((pid: string) => articles.filter((a) => a.parent_id === pid), [articles])

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/boutique/catalogue", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) })
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || "Erreur"); return }
      setEditing(null); await load()
    } finally { setBusy(false) }
  }

  async function create() {
    if (!nName.trim() || !nPrice) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/boutique/catalogue", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nName.trim(), price_alone_cents: Math.round(parseFloat(nPrice.replace(",", ".")) * 100), stock_qty: nStock === "" ? null : Math.round(Number(nStock)) }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || "Erreur"); return }
      setCreating(false); setNName(""); setNPrice(""); setNStock(""); await load()
    } finally { setBusy(false) }
  }

  async function createVariant(parentId: string) {
    if (!vName.trim()) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/boutique/catalogue", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: parentId, name: vName.trim(), stock_qty: vStock === "" ? null : Math.round(Number(vStock)) }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || "Erreur"); return }
      setVariantFor(null); setVName(""); setVStock(""); await load()
    } finally { setBusy(false) }
  }

  return (
    <div style={S.page}>
      <AdminBackButton />
      <div style={S.headRow}>
        <h1 style={S.h1}>Catalogue comptoir</h1>
        <Link href="/admin/boutique" style={S.link}>← Vente</Link>
      </div>
      {error && <p style={{ color: "#DC2626" }}>⚠ {error}</p>}

      {!creating
        ? <button onClick={() => setCreating(true)} style={S.addBtn}>+ Article</button>
        : (
          <div style={S.editBox}>
            <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Nom" style={S.input} />
            <input value={nPrice} onChange={(e) => setNPrice(e.target.value)} placeholder="Prix (€)" inputMode="decimal" style={S.input} />
            <input value={nStock} onChange={(e) => setNStock(e.target.value)} placeholder="Stock (vide = non suivi)" inputMode="numeric" style={S.input} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={create} disabled={busy} style={S.saveBtn}>Créer</button>
              <button onClick={() => setCreating(false)} style={S.cancelBtn}>Annuler</button>
            </div>
          </div>
        )}

      {parents.map((a) => {
        const vs = variantsOf(a.id)
        const activeVs = vs.filter((v) => v.active)
        const tracked = activeVs.filter((v) => v.stock_qty !== null)
        const sumStock = activeVs.length ? (tracked.length ? tracked.reduce((s, v) => s + (v.stock_qty || 0), 0) : null) : null
        const hasVariants = vs.length > 0
        return editing?.id === a.id ? (
          <div key={a.id} style={S.editBox}>
            <input defaultValue={a.name} onChange={(e) => setEditing({ ...editing!, name: e.target.value })} style={S.input} />
            <input defaultValue={(a.price_alone_cents / 100).toString()} onChange={(e) => setEditing({ ...editing!, price_alone_cents: Math.round(parseFloat(e.target.value.replace(",", ".")) * 100) })} inputMode="decimal" style={S.input} />
            {!hasVariants && <input defaultValue={a.stock_qty ?? ""} onChange={(e) => setEditing({ ...editing!, stock_qty: e.target.value === "" ? null : Math.round(Number(e.target.value)) })} placeholder="Stock (vide = non suivi)" inputMode="numeric" style={S.input} />}
            {hasVariants && <p style={S.meta}>Stock géré par variante. Le prix s’applique à toutes les variantes.</p>}
            <input defaultValue={a.image_url ?? ""} onChange={(e) => setEditing({ ...editing!, image_url: e.target.value })} placeholder="URL image (Cloudinary)" style={S.input} />
            <input defaultValue={a.jeton_price ?? ""} inputMode="numeric" onChange={(e) => setEditing({ ...editing!, jeton_price: e.target.value === "" ? null : Math.round(Number(e.target.value)) })} placeholder="Jetons (vide = pas payable en jetons)" style={S.input} />
            <label style={S.check}><input type="checkbox" defaultChecked={a.is_special} onChange={(e) => setEditing({ ...editing!, is_special: e.target.checked })} /> ⭐ Spécial</label>
            <label style={S.check}><input type="checkbox" defaultChecked={!!a.is_hero} onChange={(e) => setEditing({ ...editing!, is_hero: e.target.checked })} /> ⭐ Produit maison à l’honneur</label>
            {(editing!.is_hero ?? a.is_hero) && <input defaultValue={a.hero_text ?? ""} maxLength={120} onChange={(e) => setEditing({ ...editing!, hero_text: e.target.value })} placeholder="Texte hero (120 car. max)" style={S.input} />}
            <label style={S.check}><input type="checkbox" defaultChecked={a.active} onChange={(e) => setEditing({ ...editing!, active: e.target.checked })} /> Actif</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => patch(a.id, { name: editing!.name, price_alone_cents: editing!.price_alone_cents, ...(hasVariants ? {} : { stock_qty: editing!.stock_qty }), is_special: editing!.is_special, active: editing!.active, image_url: editing!.image_url ?? null, is_hero: !!editing!.is_hero, hero_text: editing!.hero_text ?? null, jeton_price: editing!.jeton_price ?? null })} disabled={busy} style={S.saveBtn}>Enregistrer</button>
              <button onClick={() => setEditing(null)} style={S.cancelBtn}>Annuler</button>
            </div>
          </div>
        ) : (
          <div key={a.id} style={{ ...S.parentBox, opacity: a.active ? 1 : 0.5 }}>
            <div style={S.row}>
              <div style={{ flex: 1 }}>
                <div style={S.name}>{a.is_special ? "⭐ " : ""}{a.name}{a.is_hero ? " 🏆" : ""}{!a.active && " (inactif)"}</div>
                <div style={S.meta}>
                  {euro(a.price_alone_cents)}
                  {hasVariants
                    ? ` · ${vs.length} variante${vs.length > 1 ? "s" : ""}${sumStock !== null ? ` · stock ${sumStock} (Σ)` : ""}`
                    : (a.stock_qty !== null ? ` · stock ${a.stock_qty}` : " · stock non suivi")}
                  {a.jeton_price != null ? ` · 🎋 ${a.jeton_price}` : ""}
                </div>
              </div>
              {!hasVariants && a.stock_qty !== null && <button onClick={() => patch(a.id, { reassort: 10 })} disabled={busy} style={S.reassort}>+10</button>}
              <button onClick={() => setEditing(a)} style={S.editBtn}>✏️</button>
            </div>

            {/* Variantes */}
            {vs.map((v) => (
              <div key={v.id} style={{ ...S.variantRow, opacity: v.active ? 1 : 0.5 }}>
                <span style={{ flex: 1 }}>{v.name}{!v.active && " (inactif)"}</span>
                <span style={S.vStock}>{v.stock_qty !== null ? `stock ${v.stock_qty}` : "non suivi"}</span>
                {v.stock_qty !== null && <button onClick={() => patch(v.id, { reassort: 10 })} disabled={busy} style={S.reassort}>+10</button>}
                <button onClick={() => patch(v.id, { active: !v.active })} disabled={busy} style={S.editBtn}>{v.active ? "🚫" : "✅"}</button>
              </div>
            ))}

            {variantFor === a.id ? (
              <div style={S.variantForm}>
                <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Nom variante (ex. Vanille)" style={S.input} />
                <input value={vStock} onChange={(e) => setVStock(e.target.value)} placeholder="Stock initial (optionnel)" inputMode="numeric" style={S.input} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => createVariant(a.id)} disabled={busy} style={S.saveBtn}>Ajouter</button>
                  <button onClick={() => { setVariantFor(null); setVName(""); setVStock("") }} style={S.cancelBtn}>Annuler</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setVariantFor(a.id); setVName(""); setVStock("") }} style={S.addVariant}>+ Variante</button>
            )}
          </div>
        )
      })}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 460, margin: "0 auto", padding: "12px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  headRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  h1: { fontSize: 22, fontWeight: 800, margin: "8px 0 12px" },
  link: { color: "var(--accent)", textDecoration: "none", fontSize: 14 },
  addBtn: { width: "100%", minHeight: 44, borderRadius: 12, border: "1px dashed var(--accent)", background: "none", color: "var(--accent)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 },
  editBox: { border: "1px solid var(--accent)", borderRadius: 12, padding: 12, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8, background: "#FEF9F2" },
  input: { height: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, background: "var(--bg)", color: "var(--ink)" },
  check: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, minHeight: 36 },
  saveBtn: { flex: 1, minHeight: 44, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  cancelBtn: { minHeight: 44, padding: "0 16px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", color: "var(--ink)" },
  parentBox: { border: "1px solid var(--border)", borderRadius: 12, padding: "8px 12px", marginBottom: 10 },
  row: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" },
  name: { fontWeight: 700, fontSize: 15 },
  meta: { fontSize: 12, color: "var(--ink-soft)", marginTop: 2 },
  reassort: { minHeight: 40, padding: "0 10px", background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", color: "var(--ink)", fontSize: 13 },
  editBtn: { minHeight: 40, padding: "0 10px", background: "none", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" },
  variantRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0 6px 12px", borderTop: "1px dashed var(--border)", fontSize: 14 },
  vStock: { fontSize: 12, color: "var(--ink-soft)" },
  variantForm: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8, paddingLeft: 12 },
  addVariant: { marginTop: 8, minHeight: 40, padding: "0 12px", borderRadius: 8, border: "1px dashed var(--border)", background: "none", color: "var(--accent)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: 13 },
}
