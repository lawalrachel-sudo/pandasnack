"use client"

import { useEffect, useState } from "react"

// PS-05b §2 — « Installer l'admin » (beforeinstallprompt), masqué si déjà installé.
// Ligne d'aide iOS car Safari n'expose pas beforeinstallprompt.

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return window.matchMedia?.("(display-mode: standalone)").matches || (window.navigator as any).standalone === true
}
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function InstallAdminButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isStandalone()) { setInstalled(true); return }
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent) }
    const onInstalled = () => { setInstalled(true); setDeferred(null) }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    // iOS ne déclenche jamais beforeinstallprompt → on montre l'aide manuelle.
    if (isIOS()) setShowIosHint(true)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (installed) return null
  if (!deferred && !showIosHint) return null

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice.catch(() => {})
    setDeferred(null)
  }

  return (
    <div style={{ marginTop: 16, textAlign: "center" }}>
      {deferred && (
        <button onClick={install} style={{
          minHeight: 44, padding: "10px 18px", borderRadius: 12, border: "none",
          background: "var(--accent, #C85A3C)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
        }}>
          🥘 Installer l&apos;admin
        </button>
      )}
      {showIosHint && !deferred && (
        <p style={{ fontSize: 13, color: "var(--ink-soft, #6B5742)", lineHeight: 1.5, margin: 0 }}>
          🥘 Pour installer&nbsp;: <strong>Partager</strong> → <strong>Sur l&apos;écran d&apos;accueil</strong>.
        </p>
      )}
    </div>
  )
}
