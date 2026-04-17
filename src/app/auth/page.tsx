"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [nom, setNom] = useState("")
  const [prenom, setPrenom] = useState("")
  const [telPrefix, setTelPrefix] = useState("+596")
  const [tel, setTel] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const urlError = searchParams.get("error")
    if (urlError === "no_family") {
      setError("Compte incomplet. Inscris-toi pour créer ton espace famille.")
      setMode("signup")
    } else if (urlError) {
      setError("Erreur de connexion. Réessaie ci-dessous.")
    }
  }, [searchParams])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      if (error.message.includes("Invalid login")) {
        setError("Email ou mot de passe incorrect.")
      } else {
        setError(error.message)
      }
    } else {
      router.push("/commander")
    }
    setLoading(false)
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!nom.trim() || !prenom.trim()) {
      setError("Nom et prénom sont obligatoires.")
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError("Le mot de passe doit faire au moins 6 caractères.")
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.")
      setLoading(false)
      return
    }

    const supabase = createClient()
    const fullPhone = tel.trim() ? `${telPrefix}${tel.trim().replace(/^0+/, '')}` : ""

    // 1. Create auth user
    const { data: authData, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: `${prenom.trim()} ${nom.trim()}`,
          phone: fullPhone,
        },
      },
    })

    if (signupError) {
      if (signupError.message.includes("already registered")) {
        setError("Cet email est déjà utilisé. Connecte-toi plutôt.")
        setMode("login")
      } else {
        setError(signupError.message)
      }
      setLoading(false)
      return
    }

    if (!authData.user) {
      setError("Erreur lors de la création du compte.")
      setLoading(false)
      return
    }

    // 2. Create family record
    const displayName = `Famille ${nom.trim()}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: family, error: familyError } = await (supabase as any)
      .from("families")
      .insert({
        display_name: displayName,
        primary_email: email,
        primary_phone: fullPhone || null,
        auth_user_id: authData.user.id,
      })
      .select()
      .single()

    if (familyError) {
      setError("Compte créé mais erreur famille. Contacte-nous.")
      setLoading(false)
      return
    }

    // 3. Create wallet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("wallets")
      .insert({
        family_id: family.id,
        balance_cents: 0,
        total_credited_cents: 0,
        total_debited_cents: 0,
      })

    // 4. Create first beneficiary (the child — can be edited later)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("beneficiaries")
      .insert({
        family_id: family.id,
        first_name: "Enfant",
        dietary_flags: [],
      })

    router.push("/commander")
    setLoading(false)
  }

  const inputStyle = {
    borderColor: 'var(--border)',
    background: 'var(--card)',
  }

  return (
    <>
      {mode === "signup" ? (
        <form onSubmit={handleSignup} className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-center mb-2">Inscription</h1>
          <p className="text-center text-sm mb-5" style={{ color: 'var(--ink-soft)' }}>
            Crée ton espace famille en 30 secondes
          </p>

          {error && (
            <p className="text-sm mb-3 p-3 rounded-xl text-center" style={{ background: '#FFF3F0', color: 'var(--accent)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              placeholder="Prénom"
              required
              className="w-1/2 h-12 px-4 rounded-xl border text-base outline-none focus:ring-2"
              style={inputStyle}
            />
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Nom"
              required
              className="w-1/2 h-12 px-4 rounded-xl border text-base outline-none focus:ring-2"
              style={inputStyle}
            />
          </div>

          <div className="flex gap-2 mb-3">
            <select
              value={telPrefix}
              onChange={(e) => setTelPrefix(e.target.value)}
              className="h-12 px-2 rounded-xl border text-sm outline-none focus:ring-2"
              style={inputStyle}
            >
              <option value="+596">+596 MQ</option>
              <option value="+590">+590 GP</option>
              <option value="+33">+33 FR</option>
              <option value="+594">+594 GF</option>
              <option value="+262">+262 RE</option>
              <option value="+1">+1 US/CA</option>
            </select>
            <input
              type="tel"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              placeholder="696 XX XX XX"
              className="flex-1 h-12 px-4 rounded-xl border text-base outline-none focus:ring-2"
              style={inputStyle}
            />
          </div>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full h-12 px-4 rounded-xl border text-base mb-3 outline-none focus:ring-2"
            style={inputStyle}
          />

          <div className="relative mb-3">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe (min. 6 car.)"
              required
              minLength={6}
              className="w-full h-12 px-4 pr-12 rounded-xl border text-base outline-none focus:ring-2"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
              style={{ color: 'var(--ink-soft)' }}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>

          <div className="relative mb-4">
            <input
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirmer le mot de passe"
              required
              minLength={6}
              className="w-full h-12 px-4 pr-12 rounded-xl border text-base outline-none focus:ring-2"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
              style={{ color: 'var(--ink-soft)' }}
              tabIndex={-1}
            >
              {showConfirm ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? "Création..." : "Créer mon compte"}
          </button>

          <p className="text-center text-sm mt-4" style={{ color: 'var(--ink-soft)' }}>
            Déjà inscrit ?{" "}
            <button type="button" onClick={() => { setMode("login"); setError(null) }} className="underline font-medium" style={{ color: 'var(--accent)' }}>
              Se connecter
            </button>
          </p>
        </form>
      ) : (
        <form onSubmit={handleLogin} className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-center mb-2">Connexion</h1>
          <p className="text-center text-sm mb-5" style={{ color: 'var(--ink-soft)' }}>
            Entre ton email et mot de passe
          </p>

          {error && (
            <p className="text-sm mb-3 p-3 rounded-xl text-center" style={{ background: '#FFF3F0', color: 'var(--accent)' }}>
              {error}
            </p>
          )}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full h-12 px-4 rounded-xl border text-base mb-3 outline-none focus:ring-2"
            style={inputStyle}
          />

          <div className="relative mb-4">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              required
              className="w-full h-12 px-4 pr-12 rounded-xl border text-base outline-none focus:ring-2"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
              style={{ color: 'var(--ink-soft)' }}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>

          <p className="text-center text-sm mt-4" style={{ color: 'var(--ink-soft)' }}>
            Pas encore de compte ?{" "}
            <button type="button" onClick={() => { setMode("signup"); setError(null) }} className="underline font-medium" style={{ color: 'var(--accent)' }}>
              S&apos;inscrire
            </button>
          </p>
        </form>
      )}
    </>
  )
}

export default function AuthPage() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center px-6 py-16">
      <img
        src="https://res.cloudinary.com/dbkpvp9ts/image/upload/w_200,q_auto,f_auto/v1776343210/tete_panda_panda_snack.png"
        alt="Panda"
        className="w-28 h-28 mb-6 object-contain"
      />
      <Suspense fallback={<p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Chargement...</p>}>
        <AuthForm />
      </Suspense>
    </div>
  )
}
