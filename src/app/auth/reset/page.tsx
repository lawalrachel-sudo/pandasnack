"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    // Supabase envoie le token dans le hash fragment après le clic email
    // Le client SDK le capte automatiquement via onAuthStateChange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.")
      return
    }
    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.")
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
        <div className="max-w-sm w-full text-center">
          <p className="text-4xl mb-4">🐼</p>
          <h1 className="text-xl font-bold mb-2" style={{ color: "var(--ink)" }}>Mot de passe modifié</h1>
          <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>Tu peux maintenant te connecter avec ton nouveau mot de passe.</p>
          <Link href="/auth" className="inline-block px-6 py-3 rounded-xl font-semibold text-white text-sm" style={{ background: "var(--accent)" }}>
            Se connecter
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="max-w-sm w-full">
        <div className="text-center mb-6">
          <p className="text-4xl mb-2">🐼</p>
          <h1 className="text-xl font-bold" style={{ color: "var(--ink)" }}>Nouveau mot de passe</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Choisis un nouveau mot de passe pour ton compte Panda Snack.</p>
        </div>

        {!ready && (
          <div className="rounded-xl p-4 text-center text-sm" style={{ background: "var(--bg-alt)", color: "var(--ink-soft)" }}>
            Vérification en cours...
          </div>
        )}

        {ready && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium" style={{ color: "var(--ink)" }}>Nouveau mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full h-11 px-3 mt-1 rounded-xl border text-sm" style={{ borderColor: "var(--border)" }}
                placeholder="8 caractères minimum" autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color: "var(--ink)" }}>Confirmer</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                className="w-full h-11 px-3 mt-1 rounded-xl border text-sm" style={{ borderColor: "var(--border)" }}
                placeholder="Retaper le mot de passe" />
            </div>

            {error && <div className="rounded-lg p-3 text-sm" style={{ background: "#FEF2F2", color: "#DC2626" }}>{error}</div>}

            <button type="submit" disabled={loading}
              className="w-full h-12 rounded-xl font-semibold text-white text-sm disabled:opacity-50"
              style={{ background: "var(--accent)" }}>
              {loading ? "Modification..." : "Changer mon mot de passe"}
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
