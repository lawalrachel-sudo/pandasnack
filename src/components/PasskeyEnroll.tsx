"use client"

import { useEffect, useState } from "react"
import { startRegistration } from "@simplewebauthn/browser"

// PS-13c — carte « Activer la connexion par empreinte sur cet appareil », affichée sur l'accueil
// admin (après connexion). Masquable (localStorage). N'apparaît que si le navigateur supporte
// WebAuthn. Enrôle une passkey liée à l'appareil → ensuite « Entrer avec mon empreinte » sur /admin.
const DISMISS_KEY = "ps_pk_enroll_dismissed"

export function PasskeyEnroll() {
  const [supported, setSupported] = useState(false)
  const [dismissed, setDismissed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ok = typeof window !== "undefined" && !!window.PublicKeyCredential
    let hidden = true
    try { hidden = localStorage.getItem(DISMISS_KEY) === "1" } catch { /* no-op */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(ok); setDismissed(hidden)
  }, [])

  if (!supported || dismissed || done) {
    return done ? (
      <div style={S.okBox}>✅ Connexion par empreinte activée sur cet appareil.</div>
    ) : null
  }

  async function enroll() {
    setBusy(true); setError(null)
    try {
      const label = (navigator.platform || navigator.userAgent || "Cet appareil").slice(0, 60)
      const optRes = await fetch("/api/admin/passkey/register/options", { method: "POST" })
      if (!optRes.ok) throw new Error("options")
      const options = await optRes.json()
      const attResp = await startRegistration({ optionsJSON: options })
      const verRes = await fetch("/api/admin/passkey/register/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: attResp, deviceLabel: label }),
      })
      const json = await verRes.json().catch(() => ({}))
      if (!verRes.ok) throw new Error(json?.error || "échec")
      setDone(true)
    } catch (e) {
      const msg = (e as Error)?.name === "NotAllowedError" ? "Enrôlement annulé." : "Impossible d'activer l'empreinte."
      setError(msg)
    } finally { setBusy(false) }
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, "1") } catch { /* no-op */ }
    setDismissed(true)
  }

  return (
    <div style={S.card}>
      <div style={S.title}>🔐 Connexion par empreinte</div>
      <p style={S.text}>Active l&apos;empreinte ou le visage sur cet appareil pour entrer sans mot de passe.</p>
      {error && <p style={S.err}>⚠ {error}</p>}
      <div style={S.row}>
        <button onClick={enroll} disabled={busy} style={S.primary}>{busy ? "…" : "Activer l'empreinte"}</button>
        <button onClick={dismiss} disabled={busy} style={S.ghost}>Plus tard</button>
      </div>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  card: { border: "1px solid var(--border, #E8D6BF)", background: "var(--card, #fff)", borderRadius: 14, padding: "14px 16px", marginBottom: 16 },
  title: { fontWeight: 800, fontSize: 16, marginBottom: 4 },
  text: { fontSize: 13, color: "var(--ink-soft, #6B5742)", margin: "0 0 10px" },
  row: { display: "flex", gap: 10, flexWrap: "wrap" },
  primary: { background: "#C85A3C", color: "#fff", border: "none", borderRadius: 999, padding: "10px 18px", fontWeight: 800, cursor: "pointer", minHeight: 40, fontFamily: "inherit" },
  ghost: { background: "transparent", color: "var(--ink-soft, #6B5742)", border: "1px solid var(--border, #E8D6BF)", borderRadius: 999, padding: "10px 18px", fontWeight: 700, cursor: "pointer", minHeight: 40, fontFamily: "inherit" },
  err: { color: "#DC2626", fontSize: 13, margin: "0 0 8px" },
  okBox: { border: "1px solid #BBF7D0", background: "#F0FDF4", color: "#166534", borderRadius: 12, padding: "10px 14px", fontSize: 13, marginBottom: 16, fontWeight: 600 },
}
