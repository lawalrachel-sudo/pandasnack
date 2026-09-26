"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

interface Enfant { prenom: string; classe: string | null }
interface Client {
  id: string
  nom_compte: string
  email: string
  telephone: string | null
  is_test: boolean
  enfants: Enfant[]
  balance_cents: number
  total_credited_cents: number
  orders_count: number
  last_service_date: string | null
}

function euro(c: number) { return `${(c / 100).toFixed(2).replace(".", ",")} €` }
function jour(iso: string | null) {
  return iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"
}

export function ClientsClient() {
  const [clients, setClients] = useState<Client[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")

  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/clients")
        const json = await res.json()
        if (annule) return
        if (!res.ok) throw new Error(json.error || "Erreur")
        setClients(json.clients || [])
      } catch (e) { if (!annule) setError((e as Error).message) }
    })()
    return () => { annule = true }
  }, [])

  const filtered = useMemo(() => {
    const list = clients || []
    const needle = q.trim().toLowerCase()
    const match = needle
      ? list.filter((c) =>
          c.nom_compte?.toLowerCase().includes(needle) ||
          c.email?.toLowerCase().includes(needle) ||
          c.enfants.some((e) => e.prenom.toLowerCase().includes(needle)))
      : list
    // Tri par défaut : solde décroissant.
    return [...match].sort((a, b) => b.balance_cents - a.balance_cents)
  }, [clients, q])

  return (
    <div style={S.page}>
      <Link href="/admin/dashboard" style={S.back}>← Service du jour</Link>
      <h1 style={S.h1}>Clients</h1>

      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher (nom, email, enfant)…"
        style={S.search}
      />

      {error && <p style={{ color: "#DC2626" }}>⚠ {error}</p>}
      {!clients && !error && <p style={S.muted}>Chargement…</p>}
      {clients && filtered.length === 0 && <p style={S.muted}>Aucun compte.</p>}

      {filtered.map((c) => (
        <Link key={c.id} href={`/admin/clients/${c.id}`} style={S.card}>
          <div style={S.cardTop}>
            <span style={S.nom}>{c.nom_compte}{c.is_test && <span style={S.testTag}> TEST</span>}</span>
            <strong style={S.solde}>{euro(c.balance_cents)}</strong>
          </div>
          <div style={S.sub}>
            {c.enfants.length > 0
              ? c.enfants.map((e) => `${e.prenom}${e.classe ? ` (${e.classe})` : ""}`).join(" · ")
              : <span style={S.muted}>aucun enfant actif</span>}
          </div>
          <div style={S.metaRow}>
            <span>{c.orders_count} cmd</span>
            <span>crédité {euro(c.total_credited_cents)}</span>
            <span>dernier {jour(c.last_service_date)}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 460, margin: "0 auto", padding: "16px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  back: { color: "var(--accent)", textDecoration: "none", fontSize: 14 },
  h1: { fontSize: 22, fontWeight: 800, margin: "12px 0 12px" },
  search: { width: "100%", height: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 15, marginBottom: 14, background: "var(--bg)", color: "var(--ink)" },
  muted: { color: "var(--ink-soft)", fontSize: 14 },
  card: { display: "block", textDecoration: "none", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 14, padding: 14, marginBottom: 10, background: "var(--card, #fff)" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  nom: { fontWeight: 800, fontSize: 16 },
  testTag: { fontSize: 10, color: "var(--ink-soft)", fontWeight: 700 },
  solde: { fontSize: 16, color: "var(--accent-2, #5A7F42)" },
  sub: { fontSize: 13, color: "var(--ink-soft)", marginTop: 4 },
  metaRow: { display: "flex", gap: 12, fontSize: 12, color: "var(--ink-soft)", marginTop: 8, flexWrap: "wrap" },
}
