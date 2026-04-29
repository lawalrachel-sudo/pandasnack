"use client"

import { useState } from "react"
import Link from "next/link"
import { Navbar } from "@/components/Navbar"

const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776714727/PANDA_WALLET.jpg"

interface Config {
  recharge_cents: number
  bonus_cents: number
  total_credit_cents: number
  label: string | null
  bonus_label: string | null
  badge: string | null
  active: boolean
}

interface Props {
  accountId: string
  familyName: string
  walletBalance: number
  configs: Config[]
  currentMenuPriceCents: number
  lastRechargeCents: number
  pendingCount: number
  pandaId: string | null
}

function fmtPrice(c: number): string { return `${(c / 100).toFixed(2).replace(".", ",")} €` }

export function RechargerClient({ accountId, familyName, walletBalance, configs, currentMenuPriceCents, lastRechargeCents, pendingCount, pandaId }: Props) {
  const [selectedRecharge, setSelectedRecharge] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRib, setShowRib] = useState(false)
  const [ribCopied, setRibCopied] = useState(false)

  async function copyIban() {
    try {
      await navigator.clipboard.writeText("FR76 1010 7006 2200 7330 6210 647")
      setRibCopied(true)
      setTimeout(() => setRibCopied(false), 2000)
    } catch {
      alert("Impossible de copier — sélectionne le RIB manuellement")
    }
  }

  const selectedConfig = configs.find(c => c.recharge_cents === selectedRecharge)
  const customCents = customAmount ? Math.round(parseFloat(customAmount.replace(",", ".")) * 100) : 0
  const isCustom = !selectedRecharge && customCents > 0
  const canPay = (selectedRecharge || isCustom) && !loading

  async function handleRecharge() {
    setLoading(true); setError(null)
    const amountCents = selectedConfig ? selectedConfig.recharge_cents : customCents
    const bonusCents = selectedConfig ? selectedConfig.bonus_cents : 0
    // P0 patch — palier 200 € = virement uniquement, pas Stripe
    if (selectedConfig && selectedConfig.recharge_cents === 20000) {
      setShowRib(true); setLoading(false); return
    }
    if (amountCents > 20000) { setError("Pour un montant supérieur à 200 €, contactez team@pandasnack.online"); setLoading(false); return }
    if (amountCents < 500) { setError("Montant minimum : 5 €"); setLoading(false); return }
    try {
      const res = await fetch("/api/recharger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountCents, bonusCents }) })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setError(data.error || "Erreur lors de la création du paiement")
    } catch { setError("Erreur réseau") }
    setLoading(false)
  }

  return (
    <div className="min-h-screen pb-28 max-w-lg mx-auto">
      <Navbar walletBalance={walletBalance} familyName={familyName} pendingCount={pendingCount} />

      <div className="px-4 pt-6">
        {/* Solde actuel + palier */}
        <div className="rounded-xl p-5 mb-4 text-center" style={{ background: "var(--bg-alt)" }}>
          <img src={WALLET_IMG} alt="Panda Wallet" className="w-16 h-16 rounded-full object-cover mx-auto mb-2" />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Solde actuel</p>
          <p className="text-2xl font-bold" style={{ color: "var(--accent-2)" }}>{fmtPrice(walletBalance)}</p>
          {lastRechargeCents > 0 && (
            <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
              Tes menus à {fmtPrice(currentMenuPriceCents)}
            </p>
          )}
        </div>

        {/* Explication wallet — paliers dynamiques depuis DB */}
        <div className="rounded-xl border p-4 mb-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--ink)" }}>Comment ça marche ?</p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Recharge ton Panda Wallet et profite d&apos;un bonus en crédit. Le tarif des menus est déterminé par ta dernière recharge.
          </p>
          <div className="mt-3 space-y-1">
            {configs.map(c => (
              <div key={c.recharge_cents} className="flex justify-between text-xs">
                <span style={{ color: "var(--accent-2)" }}>{c.label || `Recharge ${fmtPrice(c.recharge_cents)}`}</span>
                <span className="font-semibold" style={{ color: "var(--accent-2)" }}>{c.bonus_label || `+${fmtPrice(c.bonus_cents)} offerts`}</span>
              </div>
            ))}
          </div>
        </div>

        <h2 className="font-bold text-lg mb-4" style={{ color: "var(--ink)" }}>Recharger mon Panda Wallet</h2>

        {/* Pilules paliers — bonus_label + badge depuis DB */}
        <div className="space-y-3 mb-4">
          {configs.map(c => {
            const isSelected = selectedRecharge === c.recharge_cents

            return (
              <button key={c.recharge_cents}
                onClick={() => { setSelectedRecharge(isSelected ? null : c.recharge_cents); setCustomAmount("") }}
                className="w-full rounded-xl border p-4 text-left transition-all relative"
                style={{
                  borderColor: isSelected ? "var(--accent-2)" : "var(--border)",
                  background: isSelected ? "#F0FDF4" : "var(--card)",
                  boxShadow: isSelected ? "0 0 0 2px var(--accent-2)" : "none",
                }}>
                {c.badge && (
                  <span className="absolute -top-2 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full text-white whitespace-nowrap" style={{ background: "var(--accent)" }}>
                    {c.badge}
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-lg font-bold" style={{ color: "var(--ink)" }}>{fmtPrice(c.recharge_cents)}</span>
                    {c.bonus_label && (
                      <span className="ml-2 text-sm font-semibold" style={{ color: "var(--accent-2)" }}>{c.bonus_label}</span>
                    )}
                  </div>
                  <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: isSelected ? "var(--accent-2)" : "var(--border)" }}>
                    {isSelected && <div className="w-3 h-3 rounded-full" style={{ background: "var(--accent-2)" }} />}
                  </div>
                </div>
                {c.bonus_cents > 0 && (
                  <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                    Crédit total : {fmtPrice(c.total_credit_cents)}
                  </p>
                )}
              </button>
            )
          })}
        </div>

        {/* F5 — message contact pour recharges supérieures à 200 € */}
        <p className="text-xs text-center mb-6" style={{ color: "var(--ink-soft)" }}>
          Pour des recharges supérieures, contactez{" "}
          <a href="mailto:team@pandasnack.online" className="font-semibold underline" style={{ color: "var(--accent)" }}>team@pandasnack.online</a>
        </p>

        {/* Champ libre */}
        <div className="rounded-xl border p-4 mb-6" style={{ borderColor: isCustom ? "var(--accent)" : "var(--border)", background: "var(--card)" }}>
          <label className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Montant libre (sans bonus)</label>
          <div className="flex items-center gap-2 mt-2">
            <input type="text" inputMode="decimal" value={customAmount}
              onChange={e => { setCustomAmount(e.target.value); setSelectedRecharge(null) }}
              placeholder="Ex: 75" className="flex-1 h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--ink-soft)" }}>€</span>
          </div>
          <p className="text-[10px] mt-1" style={{ color: "var(--ink-soft)" }}>Min. 5 € · Max. 200 €</p>
        </div>

        {error && <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: "#FEF2F2", color: "#DC2626" }}>{error}</div>}

        <button onClick={handleRecharge} disabled={!canPay}
          className="w-full h-12 rounded-xl font-semibold text-white text-center text-sm disabled:opacity-50" style={{ background: "var(--accent-2)" }}>
          {loading ? "Redirection vers Stripe..."
            : selectedConfig?.recharge_cents === 20000 ? "Voir les infos de virement"
            : `Recharger${selectedConfig ? ` ${fmtPrice(selectedConfig.recharge_cents)}` : isCustom ? ` ${fmtPrice(customCents)}` : ""} par carte`}
        </button>

        <p className="text-sm text-center mt-4 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          Tu peux aussi recharger en espèces ou virement —{" "}
          <Link href="/contact" className="font-bold underline" style={{ color: "var(--accent)" }}>contacte-nous</Link>
        </p>
      </div>

      {/* P0 patch — Modal RIB pour palier 200 € (virement uniquement) */}
      {showRib && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
          <div className="rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--card)" }}>
            <div className="flex justify-between items-start mb-4 gap-3">
              <h3 className="font-bold text-lg" style={{ color: "var(--ink)" }}>Recharge 200 € par virement</h3>
              <button onClick={() => setShowRib(false)} className="text-3xl leading-none -mt-1" aria-label="Fermer" style={{ color: "var(--ink-soft)" }}>&times;</button>
            </div>
            <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
              Pour les recharges de 200 € et plus (bonus 15 à 20%), effectue un virement :
            </p>
            <div className="space-y-2 text-sm rounded-xl p-3 mb-4" style={{ background: "var(--bg-alt)" }}>
              <p><strong>IBAN :</strong> <span style={{ fontFamily: "ui-monospace, monospace" }}>FR76 1010 7006 2200 7330 6210 647</span></p>
              <p><strong>BIC :</strong> BREDFRPPXXX</p>
              <p><strong>À l&apos;ordre de :</strong> La Tribe Corp SARL</p>
              <p>
                <strong>Communication :</strong>{" "}
                {pandaId ? (
                  <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--accent)" }}>PS-WALLET-{pandaId}</span>
                ) : (
                  <span style={{ color: "#DC2626" }}>Contacte team@pandasnack.online</span>
                )}
              </p>
            </div>
            <button
              onClick={copyIban}
              className="w-full h-11 rounded-lg font-semibold text-white mb-2"
              style={{ background: ribCopied ? "#16A34A" : "var(--accent)" }}
            >
              {ribCopied ? "✓ Copié !" : "Copier le RIB"}
            </button>
            <button
              onClick={() => setShowRib(false)}
              className="w-full h-10 rounded-lg text-sm font-medium border"
              style={{ borderColor: "var(--border)", color: "var(--ink-soft)" }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
