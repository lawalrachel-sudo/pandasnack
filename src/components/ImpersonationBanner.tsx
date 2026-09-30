"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

// PS-13 — Bandeau « Mode test admin » affiché pendant la vue client (marqueur ps_impersonation).
// Masqué sur /admin. « ↩ Retour admin » ferme la session client, garde le cookie admin.
function readMarker(): string | null {
  try {
    const m = document.cookie.split("; ").find((c) => c.startsWith("ps_impersonation="))
    if (!m) return null
    const v = decodeURIComponent(m.split("=")[1] || "")
    return v || null
  } catch { return null }
}

export function ImpersonationBanner() {
  const pathname = usePathname()
  const [label, setLabel] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLabel(readMarker()) }, [pathname])

  if (!label || pathname?.startsWith("/admin") || pathname?.startsWith("/auth")) return null

  async function exit() {
    setLeaving(true)
    try {
      const res = await fetch("/api/admin/impersonate/exit", { method: "POST" })
      const json = await res.json().catch(() => ({}))
      window.location.href = json?.redirect || "/admin/home"
    } catch { window.location.href = "/admin/home" }
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 60,
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center",
      background: "#92400E", color: "#fff", fontSize: 13, fontWeight: 600,
      padding: "6px 12px", paddingTop: "calc(6px + env(safe-area-inset-top, 0px))",
      fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif",
    }}>
      <span>🧪 Mode test admin — {label} · paie avec le wallet ou sur place (la CB Stripe est réelle)</span>
      <button onClick={exit} disabled={leaving}
        style={{ background: "#fff", color: "#92400E", border: "none", borderRadius: 999, padding: "3px 12px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit", minHeight: 32 }}>
        {leaving ? "…" : "↩ Retour admin"}
      </button>
    </div>
  )
}
