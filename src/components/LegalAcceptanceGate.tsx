"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { CURRENT_CGU_VERSION } from "@/lib/legal"

// Modal bloquante affichée si user connecté + cgu_version DB ≠ CURRENT_CGU_VERSION.
// Garantit la traçabilité juridique (preuve d'acceptation horodatée + versionnée
// par compte). Pas de dismiss : on ne peut continuer qu'en acceptant.
export default function LegalAcceptanceGate() {
  const [needsAcceptance, setNeedsAcceptance] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    async function check() {
      try {
        // Cast `any` : la colonne cgu_version a été ajoutée par migration v1_12a
        // mais les types Supabase générés n'ont pas été regen — pattern repo standard.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = createClient() as any
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return  // pas connecté → pas concerné
        const { data: account } = await supabase
          .from("accounts")
          .select("cgu_version")
          .eq("auth_user_id", user.id)
          .maybeSingle()
        if (cancel) return
        // Pas encore d'account = onboarding va le créer avec la version courante.
        // Si la version DB ≠ courante (null, ancienne) → modal.
        if (account && account.cgu_version !== CURRENT_CGU_VERSION) {
          setUserId(user.id)
          setNeedsAcceptance(true)
        }
      } catch {
        // silencieux : on ne veut pas bloquer l'app si Supabase indispo
      }
    }
    check()
    return () => { cancel = true }
  }, [])

  async function handleValidate() {
    if (!accepted || !userId || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any
      const { error: upErr } = await supabase
        .from("accounts")
        .update({
          cgu_accepted_at: new Date().toISOString(),
          cgu_version: CURRENT_CGU_VERSION,
        })
        .eq("auth_user_id", userId)
      if (upErr) throw upErr
      setNeedsAcceptance(false)
    } catch (e) {
      setError((e as Error).message || "Erreur, réessaie.")
      setSubmitting(false)
    }
  }

  if (!needsAcceptance) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-gate-title"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.55)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: "var(--card, var(--bg))", color: "var(--ink)", border: "1px solid var(--border)" }}
      >
        <h2 id="legal-gate-title" className="text-lg font-bold mb-3" style={{ color: "var(--ink)" }}>
          Mise à jour des conditions
        </h2>
        <p className="text-sm mb-4 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          Nos conditions générales ont été mises à jour. Merci de les valider pour continuer.
        </p>

        <div
          className="flex flex-wrap gap-3 text-sm mb-5 p-3 rounded-lg"
          style={{ background: "var(--bg-alt)" }}
        >
          <Link
            href="/cgv"
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring underline font-semibold"
            style={{ color: "var(--accent)" }}
          >
            CGV ↗
          </Link>
          <Link
            href="/cgu"
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring underline font-semibold"
            style={{ color: "var(--accent)" }}
          >
            CGU ↗
          </Link>
          <Link
            href="/mentions-legales"
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring underline font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Mentions légales ↗
          </Link>
        </div>

        <label className="flex items-start gap-3 text-sm mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="focus-ring mt-0.5 w-5 h-5 shrink-0"
            style={{ accentColor: "var(--accent)" }}
            aria-label="J'ai lu et j'accepte les CGV, CGU et mentions légales"
          />
          <span style={{ color: "var(--ink)" }}>
            J&apos;ai lu et j&apos;accepte les CGV, CGU et mentions légales.
          </span>
        </label>

        {error && (
          <p role="alert" className="text-xs mb-3" style={{ color: "var(--status-cancelled, #DC2626)" }}>
            ⚠ {error}
          </p>
        )}

        <button
          onClick={handleValidate}
          disabled={!accepted || submitting}
          aria-label="Valider l'acceptation des conditions"
          className="focus-ring w-full min-h-11 h-12 rounded-xl font-semibold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "var(--accent)" }}
        >
          {submitting ? "Enregistrement…" : "Valider"}
        </button>
      </div>
    </div>
  )
}
