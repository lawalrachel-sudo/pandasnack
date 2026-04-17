"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

export default function AuthPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center px-6 py-16">
      <img
        src="https://res.cloudinary.com/dbkpvp9ts/image/upload/w_200,q_auto,f_auto/v1776343210/tete_panda_panda_snack.png"
        alt="Panda"
        className="w-28 h-28 mb-6 object-contain"
      />

      {sent ? (
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold mb-3">Vérifie ta boîte mail</h1>
          <p style={{ color: 'var(--ink-soft)' }}>
            Un lien de connexion a été envoyé à <strong>{email}</strong>.
            Clique dessus pour accéder à ton espace.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-center mb-2">Connexion</h1>
          <p className="text-center text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
            Entre ton email pour recevoir un lien magique
          </p>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="parent@email.com"
            required
            className="w-full h-12 px-4 rounded-xl border text-base mb-3 outline-none focus:ring-2"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
            }}
          />

          {error && (
            <p className="text-sm mb-3" style={{ color: 'var(--accent)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? "Envoi..." : "Recevoir le lien"}
          </button>
        </form>
      )}
    </div>
  )
}
