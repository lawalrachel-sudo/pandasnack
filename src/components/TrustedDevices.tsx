"use client"

import { useEffect, useState } from "react"

// PS-13c — « Mes appareils » : liste des appareils de confiance + retrait. Affiché sur l'accueil
// admin. Un appareil de confiance entre dans /admin sans mot de passe (le mot de passe reste le
// secours). « Retirer » révoque l'appareil (il redemandera le mot de passe).
interface Device { id: string; device_label: string | null; last_seen_at: string | null; current: boolean }

function fmt(d: string | null): string {
  if (!d) return "—"
  try { return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) } catch { return "—" }
}

export function TrustedDevices() {
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch("/api/admin/devices")
      const json = await res.json().catch(() => ({}))
      if (res.ok) setDevices(json.devices || [])
      else setDevices([])
    } catch { setDevices([]) }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [])

  async function remove(id: string, current: boolean) {
    setBusy(id); setError(null)
    try {
      const res = await fetch("/api/admin/devices/remove", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error()
      // eslint-disable-next-line react-hooks/immutability
      if (current) { window.location.href = "/admin"; return } // on vient de retirer CET appareil
      await load()
    } catch { setError("Retrait impossible, réessaie.") } finally { setBusy(null) }
  }

  if (!devices || devices.length === 0) return null

  return (
    <details style={S.wrap}>
      <summary style={S.summary}>📱 Mes appareils de confiance ({devices.length})</summary>
      <p style={S.hint}>Ces appareils entrent sans mot de passe. Retire ceux que tu ne reconnais pas.</p>
      {error && <p style={S.err}>⚠ {error}</p>}
      {devices.map((d) => (
        <div key={d.id} style={S.row}>
          <div>
            <div style={S.label}>{d.device_label || "Appareil"}{d.current ? " · cet appareil" : ""}</div>
            <div style={S.sub}>Dernière visite : {fmt(d.last_seen_at)}</div>
          </div>
          <button onClick={() => remove(d.id, d.current)} disabled={busy === d.id} style={S.remove}>
            {busy === d.id ? "…" : "Retirer"}
          </button>
        </div>
      ))}
    </details>
  )
}

const S: Record<string, React.CSSProperties> = {
  wrap: { border: "1px solid var(--border, #E8D6BF)", background: "var(--card, #fff)", borderRadius: 14, padding: "10px 14px", marginBottom: 16 },
  summary: { fontWeight: 800, fontSize: 15, cursor: "pointer", listStyle: "none" },
  hint: { fontSize: 12.5, color: "var(--ink-soft, #6B5742)", margin: "8px 0 10px" },
  err: { color: "#DC2626", fontSize: 13, margin: "0 0 8px" },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border, #F0E6D6)" },
  label: { fontWeight: 700, fontSize: 14 },
  sub: { fontSize: 12, color: "var(--ink-soft, #6B5742)" },
  remove: { background: "transparent", color: "#B84A2E", border: "1px solid #F5B5A8", borderRadius: 999, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minHeight: 36, whiteSpace: "nowrap" },
}
