"use client"

import { useEffect, useState } from "react"
import { startAuthentication } from "@simplewebauthn/browser"

// PS-13c — bouton « Entrer avec mon empreinte » sur la page de connexion admin. Le mot de passe
// reste le secours (champ au-dessus). N'apparaît que si le navigateur supporte WebAuthn.
export function PasskeyLoginButton({ next = "/admin/home" }: { next?: string }) {
  const [supported, setSupported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(typeof window !== "undefined" && !!window.PublicKeyCredential)
  }, [])

  if (!supported) return null

  async function login() {
    setBusy(true); setError(null)
    try {
      const optRes = await fetch("/api/admin/passkey/login/options", { method: "POST" })
      if (!optRes.ok) throw new Error("options")
      const options = await optRes.json()
      const asResp = await startAuthentication({ optionsJSON: options })
      const verRes = await fetch("/api/admin/passkey/login/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: asResp }),
      })
      const json = await verRes.json().catch(() => ({}))
      if (!verRes.ok) throw new Error(json?.error || "échec")
      window.location.href = next || json?.redirect || "/admin/home"
    } catch (e) {
      const name = (e as Error)?.name
      setError(name === "NotAllowedError" ? "Connexion annulée." : "Empreinte non reconnue. Utilise le mot de passe.")
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={S.sep}><span style={S.sepTxt}>ou</span></div>
      {error && <div style={S.err}>{error}</div>}
      <button type="button" onClick={login} disabled={busy} style={S.btn}>
        {busy ? "…" : "🔐 Entrer avec mon empreinte"}
      </button>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  sep: { display: "flex", alignItems: "center", textAlign: "center", color: "#B9A68E", margin: "4px 0 12px", fontSize: 12 },
  sepTxt: { padding: "0 10px" },
  btn: { width: "100%", background: "#fff", color: "#C85A3C", border: "1.5px solid #C85A3C", borderRadius: 12, padding: "13px 20px", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", minHeight: 48 },
  err: { background: "#FEF2F0", border: "1px solid #F5B5A8", color: "#B84A2E", padding: "9px 12px", borderRadius: 10, fontSize: 13, marginBottom: 10, textAlign: "center" },
}
