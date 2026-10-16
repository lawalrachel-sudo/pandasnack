"use client"

import { useEffect, useState } from "react"
import { AdminBackButton } from "../../AdminBackButton"

interface Mvt {
  id: string; qty: number; source: string; note: string | null; is_test: boolean; created_at: string
  bubble_options: { name: string; kind: string; unite: string } | null
}
const SOURCE_LABEL: Record<string, string> = {
  vente_precommande: "Vente précommande", vente_comptoir: "Vente comptoir", annulation: "Annulation",
  reassort: "Réassort", ticket: "Ticket", inventaire: "Inventaire",
}
function jour(iso: string) { return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) }

export function HistoriqueClient() {
  const [mvts, setMvts] = useState<Mvt[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/bubble-tea?history=1")
        const json = await res.json()
        if (annule) return
        if (!res.ok) throw new Error(json.error || "Erreur")
        setMvts(json.mouvements || [])
      } catch (e) { if (!annule) setError((e as Error).message) }
    })()
    return () => { annule = true }
  }, [])

  return (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "16px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" }}>
      <AdminBackButton />
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "12px 0 12px" }}>🧋 Historique des mouvements</h1>
      {error && <p style={{ color: "#DC2626", fontSize: 14 }}>⚠ {error}</p>}
      {!mvts && !error && <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>}
      {mvts && mvts.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Aucun mouvement.</p>}
      {mvts?.map((m) => (
        <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
          <span>{m.bubble_options?.name} · {SOURCE_LABEL[m.source] || m.source}{m.is_test ? " (test)" : ""}</span>
          <span style={{ color: m.qty < 0 ? "#DC2626" : "var(--accent-2, #5A7F42)", fontWeight: 700 }}>{m.qty > 0 ? "+" : ""}{m.qty} {m.bubble_options?.unite}</span>
          <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>{jour(m.created_at)}</span>
        </div>
      ))}
    </div>
  )
}
