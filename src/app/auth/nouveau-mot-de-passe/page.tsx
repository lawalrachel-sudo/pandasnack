"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { Logo } from "@/components/Logo"

// PS-09a — Réinitialisation du mot de passe (sans l'ancien). Ouvre la session de récupération
// (échange du code PKCE OU event PASSWORD_RECOVERY), puis updateUser({ password }).
function NouveauMotDePasseContent() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<"checking" | "ready" | "expired">("checking")

  useEffect(() => {
    const supabase = createClient()
    let done = false
    const markReady = () => { if (!done) { done = true; setStatus("ready") } }

    // Voie PKCE : ?code=... dans l'URL → échange contre une session.
    const url = new URL(window.location.href)
    const code = url.searchParams.get("code")
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error }) => { if (error) setStatus((s) => (s === "ready" ? s : "expired")); else markReady() })
        .catch(() => setStatus((s) => (s === "ready" ? s : "expired")))
    }

    // Voie implicite / hash : le SDK émet PASSWORD_RECOVERY quand il capte le token.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) markReady()
    })

    // Une session déjà présente (lien déjà consommé par le SDK) suffit.
    supabase.auth.getSession().then(({ data }) => { if (data.session) markReady() })

    // Sans session ni code au bout de 4 s : lien expiré/invalide.
    const t = setTimeout(() => { if (!done && !code) setStatus("expired") }, 4000)
    return () => { subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError("Le mot de passe doit faire au moins 8 caractères."); return }
    if (password !== confirmPassword) { setError("Les deux mots de passe ne correspondent pas."); return }
    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) { setError(updateError.message); return }
    router.push("/mon-espace")
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3"><Logo size="lg" /></div>
          <h1 className="text-xl font-bold" style={{ color: "var(--ink)" }}>Nouveau mot de passe</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Choisis un nouveau mot de passe pour ton compte Panda Snack.</p>
        </div>

        {status === "checking" && (
          <div className="rounded-xl p-4 text-center text-sm" style={{ background: "var(--bg-alt)", color: "var(--ink-soft)" }}>
            Vérification du lien…
          </div>
        )}

        {status === "expired" && (
          <div className="text-center space-y-4">
            <div className="rounded-xl p-4 text-sm" style={{ background: "#FEF2F2", color: "#DC2626" }}>
              Ce lien est expiré ou invalide. Demande un nouveau lien de réinitialisation.
            </div>
            <Link href="/auth" className="inline-block px-6 py-3 rounded-xl font-semibold text-white text-sm" style={{ background: "var(--accent)" }}>
              Renvoyer un lien
            </Link>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium" style={{ color: "var(--ink)" }}>Nouveau mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full h-11 px-3 mt-1 rounded-xl border text-sm" style={{ borderColor: "var(--border)" }}
                placeholder="8 caractères minimum" autoFocus autoComplete="new-password" />
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color: "var(--ink)" }}>Confirmer</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                className="w-full h-11 px-3 mt-1 rounded-xl border text-sm" style={{ borderColor: "var(--border)" }}
                placeholder="Retaper le mot de passe" autoComplete="new-password" />
            </div>
            {error && <div className="rounded-lg p-3 text-sm" style={{ background: "#FEF2F2", color: "#DC2626" }}>{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full h-12 rounded-xl font-semibold text-white text-sm disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {loading ? "Modification…" : "Changer mon mot de passe"}
            </button>
          </form>
        )}

        <div className="text-center mt-4">
          <Link href="/auth" className="text-sm underline" style={{ color: "var(--accent)" }}>Retour à la connexion</Link>
        </div>
      </div>
    </div>
  )
}

export default function NouveauMotDePassePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm">Chargement…</div>}>
      <NouveauMotDePasseContent />
    </Suspense>
  )
}
