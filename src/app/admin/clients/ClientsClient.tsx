"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AdminBackButton } from "../AdminBackButton"

interface Enfant { prenom: string; classe: string | null }
interface Client {
  id: string
  nom_compte: string
  email: string
  telephone: string | null
  is_test: boolean
  archived_at: string | null
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
function jourCourt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : ""
}

export function ClientsClient() {
  const [clients, setClients] = useState<Client[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [includeArchives, setIncludeArchives] = useState(false)
  const [showArchives, setShowArchives] = useState(false)

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

  const needle = q.trim().toLowerCase()
  const matches = (c: Client) => !needle
    || c.nom_compte?.toLowerCase().includes(needle)
    || c.email?.toLowerCase().includes(needle)
    || c.enfants.some((e) => e.prenom.toLowerCase().includes(needle))
  const bySolde = (a: Client, b: Client) => b.balance_cents - a.balance_cents

  const actifs = useMemo(
    () => (clients || []).filter((c) => !c.archived_at && matches(c)).sort(bySolde),
    [clients, needle] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const archives = useMemo(
    () => (clients || []).filter((c) => c.archived_at && matches(c)).sort(bySolde),
    [clients, needle] // eslint-disable-line react-hooks/exhaustive-deps
  )

  function Card({ c, archived }: { c: Client; archived?: boolean }) {
    return (
      <Link href={`/admin/clients/${c.id}`} style={{ ...S.card, ...(archived ? S.cardArchived : {}) }}>
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
          {archived
            ? <span>Archivé le {jourCourt(c.archived_at)}</span>
            : <><span>{c.orders_count} cmd</span><span>crédité {euro(c.total_credited_cents)}</span><span>dernier {jour(c.last_service_date)}</span></>}
        </div>
      </Link>
    )
  }

  return (
    <div style={S.page}>
      <AdminBackButton />
      <h1 style={S.h1}>Clients {clients && <span style={S.count}>({actifs.length})</span>}</h1>

      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher (nom, email, enfant)…"
        style={S.search}
      />
      <label style={S.incArch}>
        <input type="checkbox" checked={includeArchives} onChange={(e) => setIncludeArchives(e.target.checked)} style={{ width: 18, height: 18 }} />
        Inclure les archives dans la recherche
      </label>

      {error && <p style={{ color: "#DC2626" }}>⚠ {error}</p>}
      {!clients && !error && <p style={S.muted}>Chargement…</p>}
      {clients && actifs.length === 0 && <p style={S.muted}>Aucun compte actif.</p>}

      {actifs.map((c) => <Card key={c.id} c={c} />)}

      {/* Résultats archivés remontés dans la recherche */}
      {clients && needle && includeArchives && archives.length > 0 && (
        <>
          <h2 style={S.h2}>Archives correspondantes ({archives.length})</h2>
          {archives.map((c) => <Card key={c.id} c={c} archived />)}
        </>
      )}

      {/* Section Archives repliée (hors recherche) */}
      {clients && !needle && archives.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button onClick={() => setShowArchives((v) => !v)} style={S.archHead}>
            {showArchives ? "▾" : "▸"} Archives ({archives.length})
          </button>
          {showArchives && archives.map((c) => <Card key={c.id} c={c} archived />)}
        </div>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 460, margin: "0 auto", padding: "16px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  h1: { fontSize: 22, fontWeight: 800, margin: "12px 0 12px" },
  count: { color: "var(--ink-soft)", fontWeight: 600, fontSize: 16 },
  search: { width: "100%", height: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 15, marginBottom: 8, background: "var(--bg)", color: "var(--ink)" },
  incArch: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-soft)", marginBottom: 14, minHeight: 36 },
  muted: { color: "var(--ink-soft)", fontSize: 14 },
  h2: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-soft)", margin: "18px 0 8px" },
  card: { display: "block", textDecoration: "none", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 14, padding: 14, marginBottom: 10, background: "var(--card, #fff)" },
  cardArchived: { opacity: 0.6, background: "var(--bg-alt)" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  nom: { fontWeight: 800, fontSize: 16 },
  testTag: { fontSize: 10, color: "var(--ink-soft)", fontWeight: 700 },
  solde: { fontSize: 16, color: "var(--accent-2, #5A7F42)" },
  sub: { fontSize: 13, color: "var(--ink-soft)", marginTop: 4 },
  metaRow: { display: "flex", gap: 12, fontSize: 12, color: "var(--ink-soft)", marginTop: 8, flexWrap: "wrap" },
  archHead: { width: "100%", textAlign: "left", background: "none", border: "none", padding: "10px 0", fontSize: 14, fontWeight: 700, color: "var(--ink-soft)", cursor: "pointer", fontFamily: "inherit" },
}
