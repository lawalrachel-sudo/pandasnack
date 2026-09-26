"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface Svc { service_date: string; revenue_cents: number; orders: number }

function euro(c: number) { return `${(c / 100).toFixed(2).replace(".", ",")} €` }
function jour(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" })
}

export function HistoriqueClient() {
  const [services, setServices] = useState<Svc[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/history")
        const json = await res.json()
        if (annule) return
        if (!res.ok) throw new Error(json.error || "Erreur")
        setServices(json.services || [])
        setTotal(json.total_cents || 0)
      } catch (e) { if (!annule) setError((e as Error).message) }
    })()
    return () => { annule = true }
  }, [])

  const S: Record<string, React.CSSProperties> = {
    page: { maxWidth: 460, margin: "0 auto", padding: "16px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
    row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 12px", borderBottom: "1px solid var(--border)" },
    total: { display: "flex", justifyContent: "space-between", padding: "14px 12px", fontWeight: 800, fontSize: 18, background: "var(--bg-alt)", borderRadius: 12, marginTop: 12 },
  }

  return (
    <div style={S.page}>
      <Link href="/admin/dashboard" style={{ color: "var(--accent)", textDecoration: "none", fontSize: 14 }}>← Service du jour</Link>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "12px 0 12px" }}>Historique</h1>
      {error && <p style={{ color: "#DC2626" }}>⚠ {error}</p>}
      {!services && !error && <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>}
      {services && services.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Aucun service encaissé.</p>}
      {services && services.map((s) => (
        <div key={s.service_date} style={S.row}>
          <span style={{ textTransform: "capitalize" }}>{jour(s.service_date)}</span>
          <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>{s.orders} cmd</span>
          <strong>{euro(s.revenue_cents)}</strong>
        </div>
      ))}
      {services && services.length > 0 && (
        <div style={S.total}><span>Total CA</span><span>{euro(total)}</span></div>
      )}
    </div>
  )
}
