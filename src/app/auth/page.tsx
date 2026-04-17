"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function AuthPage() {
  const [email, setEmail] = useState("")
  const [step, setStep] = useState<"email" | "otp">("email")
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    const urlError = searchParams.get("error")
    if (urlError) {
      setError("Erreur de connexion. Réessaie ci-dessous.")
    }
  }, [searchParams])

  // Auto-focus first OTP input when step changes
  useEffect(() => {
    if (step === "otp") {
      inputRefs.current[0]?.focus()
    }
  }, [step])

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setStep("otp")
    }
    setLoading(false)
  }

  async function handleVerifyOtp(code: string) {
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    })

    if (error) {
      setError("Code invalide ou expiré. Réessaie.")
      setOtp(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } else {
      router.push("/commander")
    }
    setLoading(false)
  }

  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return // Only digits

    const newOtp = [...otp]
    newOtp[index] = value.slice(-1) // Only last digit
    setOtp(newOtp)

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 6 digits entered
    const fullCode = newOtp.join("")
    if (fullCode.length === 6) {
      handleVerifyOtp(fullCode)
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (pasted.length === 6) {
      const newOtp = pasted.split("")
      setOtp(newOtp)
      handleVerifyOtp(pasted)
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center px-6 py-16">
      <img
        src="https://res.cloudinary.com/dbkpvp9ts/image/upload/w_200,q_auto,f_auto/v1776343210/tete_panda_panda_snack.png"
        alt="Panda"
        className="w-28 h-28 mb-6 object-contain"
      />

      {step === "otp" ? (
        <div className="text-center max-w-sm w-full">
          <h1 className="text-xl font-bold mb-2">Entre ton code</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
            Un code à 6 chiffres a été envoyé à <strong>{email}</strong>
          </p>

          {error && (
            <p className="text-sm mb-3 p-3 rounded-xl text-center" style={{ background: '#FFF3F0', color: 'var(--accent)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-center mb-6" onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className="w-12 h-14 text-center text-2xl font-bold rounded-xl border outline-none focus:ring-2"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                }}
                disabled={loading}
              />
            ))}
          </div>

          {loading && (
            <p className="text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>
              Vérification...
            </p>
          )}

          <button
            onClick={() => { setStep("email"); setOtp(["", "", "", "", "", ""]); setError(null) }}
            className="text-sm underline"
            style={{ color: 'var(--ink-soft)' }}
          >
            Changer d&apos;email ou renvoyer le code
          </button>
        </div>
      ) : (
        <form onSubmit={handleSendOtp} className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-center mb-2">Connexion</h1>
          <p className="text-center text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
            Entre ton email pour recevoir un code de connexion
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
            placeholder="parent@email.com"
            required
            className="w-full h-12 px-4 rounded-xl border text-base mb-3 outline-none focus:ring-2"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
            }}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? "Envoi..." : "Recevoir mon code"}
          </button>
        </form>
      )}
    </div>
  )
}
