"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ADMIN_TILES, tileHref } from "@/lib/admin-nav"

// PS-06e — accueil admin : tuiles 2 colonnes, mobile-first 430 px, Fredoka. Pas d'onglets.
export function HomeClient() {
  // Date du prochain service pour les tuiles datées (Veille, Étiquettes) ; défaut = aujourd'hui.
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0])

  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/service")
        const json = await res.json()
        if (!annule && res.ok && json.slot?.service_date) setDate(json.slot.service_date)
      } catch { /* garde la date du jour */ }
    })()
    return () => { annule = true }
  }, [])

  return (
    <div style={S.page}>
      <header style={S.header}>
        <h1 style={S.h1}>🥘 Admin Panda Snack</h1>
        <button
          onClick={async () => { await fetch("/api/admin/logout", { method: "POST" }).catch(() => {}); window.location.href = "/admin" }}
          style={S.logout}
        >Déconnexion</button>
      </header>

      <div style={S.grid}>
        {ADMIN_TILES.map((t) => {
          if (t.disabled) {
            return (
              <div key={t.key} style={{ ...S.tile, ...S.tileDisabled }} aria-disabled="true">
                <span style={S.emoji}>{t.emoji}</span>
                <span style={S.label}>{t.label}</span>
                {t.badge && <span style={S.badge}>{t.badge}</span>}
              </div>
            )
          }
          return (
            <Link key={t.key} href={tileHref(t, date)} style={S.tile}>
              <span style={S.emoji}>{t.emoji}</span>
              <span style={S.label}>{t.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 460, margin: "0 auto", padding: "16px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  h1: { fontSize: 22, fontWeight: 800, margin: 0 },
  logout: { background: "none", border: "none", color: "var(--accent)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", minHeight: 44, padding: "0 4px" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  tile: {
    position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 8, minHeight: 110, borderRadius: 18, textDecoration: "none",
    background: "var(--bg-alt)", border: "1px solid var(--border)", color: "var(--ink)",
  },
  tileDisabled: { opacity: 0.5, cursor: "not-allowed", background: "var(--bg-alt)" },
  emoji: { fontSize: 34, lineHeight: 1 },
  label: { fontSize: 15, fontWeight: 700, textAlign: "center" },
  badge: { position: "absolute", top: 8, right: 8, fontSize: 10, fontWeight: 700, color: "var(--ink-soft)", background: "var(--bg)", borderRadius: 999, padding: "2px 8px", border: "1px solid var(--border)" },
}
