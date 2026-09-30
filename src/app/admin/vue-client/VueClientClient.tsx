"use client"

import { useState } from "react"
import { AdminBackButton } from "../AdminBackButton"

interface TestAccount { id: string; email: string | null; nom_compte: string | null; prenom: string | null }

export function VueClientClient({ accounts }: { accounts: TestAccount[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function enter(accountId: string) {
    setBusy(accountId); setError(null)
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || "Erreur"); return }
      // eslint-disable-next-line react-hooks/immutability
      window.location.href = json.redirect || "/commander"   // navigation dure → cookies pris en compte
    } catch { setError("Erreur réseau") } finally { setBusy(null) }
  }

  return (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "12px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" }}>
      <AdminBackButton />
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "8px 0 4px" }}>👀 Vue client</h1>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 14 }}>
        Teste l&apos;appli comme un parent, avec un <strong>compte test</strong>. La CB Stripe reste réelle — paie avec le wallet ou sur place.
      </p>
      {error && <p style={{ color: "#DC2626", fontSize: 14 }}>⚠ {error}</p>}
      {accounts.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Aucun compte test disponible.</p>}
      {accounts.map((a) => (
        <button key={a.id} onClick={() => enter(a.id)} disabled={!!busy}
          style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", minHeight: 56, padding: "10px 14px", marginBottom: 10, border: "1px solid var(--border)", borderRadius: 12, background: "var(--card, #fff)", cursor: "pointer", fontFamily: "inherit", color: "var(--ink)", textAlign: "left" }}>
          <span style={{ fontWeight: 700 }}>{a.prenom || a.nom_compte || "Compte test"}</span>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{a.nom_compte}{a.email ? ` · ${a.email}` : ""}{busy === a.id ? " · ouverture…" : ""}</span>
        </button>
      ))}
    </div>
  )
}
