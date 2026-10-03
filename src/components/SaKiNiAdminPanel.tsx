"use client"

import { useCallback, useEffect, useState } from "react"

// PS-14 — Panneau « 🍽️ Sa ki ni » du Service du jour : pour la date affichée, liste les plats
// éligibles présents dans les commandes du jour et permet d'ouvrir X portions EN PLUS (+/–).
// Utilisable de la clôture (veille 20h) à 10h30 le jour J. Remettre à 0 = fermer.
interface Plat { catalog_item_id: string; name: string; qty_ouverte: number; qty_vendue: number }
interface Panel { slot_id: string | null; service_date: string; plats: Plat[] }

export function SaKiNiAdminPanel({ date }: { date: string }) {
  const [panel, setPanel] = useState<Panel | null>(null)
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/sa-ki-ni?date=${date}`)
      const json = await res.json()
      if (res.ok) {
        setPanel(json)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setDraft(Object.fromEntries((json.plats || []).map((p: Plat) => [p.catalog_item_id, p.qty_ouverte])))
      }
    } catch { /* silencieux */ }
  }, [date])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMsg(null); load() }, [load])

  if (!panel || !panel.slot_id || panel.plats.length === 0) return null

  function setQty(id: string, v: number, sold: number) {
    setDraft((d) => ({ ...d, [id]: Math.max(sold, Math.max(0, v)) })) // jamais sous ce qui est pris
  }

  async function save() {
    if (!panel?.slot_id) return
    setSaving(true); setMsg(null)
    try {
      const offers = panel.plats.map((p) => ({ catalog_item_id: p.catalog_item_id, qty_ouverte: draft[p.catalog_item_id] ?? 0 }))
      const res = await fetch("/api/admin/sa-ki-ni", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: panel.slot_id, offers }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error()
      setPanel(json)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setDraft(Object.fromEntries((json.plats || []).map((p: Plat) => [p.catalog_item_id, p.qty_ouverte])))
      setMsg("Enregistré ✓")
    } catch { setMsg("Échec de l'enregistrement") } finally { setSaving(false) }
  }

  return (
    <section style={S.box}>
      <div style={S.head}>🍽️ Sa ki ni <span style={S.sub}>portions en plus (jour J jusqu&apos;à 10h30)</span></div>
      {panel.plats.map((p) => {
        const val = draft[p.catalog_item_id] ?? 0
        return (
          <div key={p.catalog_item_id} style={S.row}>
            <div style={S.name}>{p.name}</div>
            <div style={S.stepper}>
              <button style={S.step} onClick={() => setQty(p.catalog_item_id, val - 1, p.qty_vendue)} aria-label="Moins">–</button>
              <span style={S.val}>{val}</span>
              <button style={S.step} onClick={() => setQty(p.catalog_item_id, val + 1, p.qty_vendue)} aria-label="Plus">+</button>
            </div>
            <div style={S.count}>{p.qty_ouverte} ouvertes · {p.qty_vendue} prises</div>
          </div>
        )
      })}
      <div style={S.actions}>
        <button style={S.save} onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</button>
        {msg && <span style={S.msg}>{msg}</span>}
      </div>
    </section>
  )
}

const S: Record<string, React.CSSProperties> = {
  box: { border: "1px solid var(--border, #E8D6BF)", background: "var(--card, #fff)", borderRadius: 14, padding: "12px 14px", margin: "4px 0 16px" },
  head: { fontWeight: 800, fontSize: 16, marginBottom: 10 },
  sub: { fontWeight: 600, fontSize: 12, color: "var(--ink-soft, #6B5742)", marginLeft: 6 },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border, #F0E6D6)", flexWrap: "wrap" },
  name: { flex: "1 1 140px", fontWeight: 700, fontSize: 14 },
  stepper: { display: "flex", alignItems: "center", gap: 10 },
  step: { width: 36, height: 36, borderRadius: 999, border: "1px solid var(--border, #E8D6BF)", background: "#fff", fontSize: 20, fontWeight: 800, cursor: "pointer", lineHeight: 1 },
  val: { minWidth: 24, textAlign: "center", fontWeight: 800, fontSize: 16 },
  count: { flex: "1 1 100%", fontSize: 12, color: "var(--ink-soft, #6B5742)" },
  actions: { display: "flex", alignItems: "center", gap: 12, marginTop: 10 },
  save: { background: "#C85A3C", color: "#fff", border: "none", borderRadius: 999, padding: "9px 18px", fontWeight: 800, cursor: "pointer", minHeight: 40, fontFamily: "inherit" },
  msg: { fontSize: 13, color: "var(--ink-soft, #6B5742)" },
}
