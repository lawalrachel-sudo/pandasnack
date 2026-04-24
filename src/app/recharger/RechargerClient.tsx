"use client"

import { useState } from "react"
import Link from "next/link"
import { Navbar } from "@/components/Navbar"

const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776714727/PANDA_WALLET.jpg"

interface Config { id: string; amount_cents: number; bonus_cents: number; label: string | null; active: boolean }

interface Props {
  accountId: string
  familyName: string
  walletBalance: number
  configs: Config[]
}

function fmtPrice(c: number): string { return `${(c / 100).toFixed(2).replace(".", ",")} €` }

export function RechargerClient({ accountId, familyName, walletBalance, configs }: Props) {
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null)
  const [customAmount, setCustomAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPill = configs.find(c => c.id === selectedConfig)
  const customCents = customAmount ? Math.round(parseFloat(customAmount.replace(",", ".")) * 100) : 0
  const isCustom = !selectedConfig && customCents > 0
  const canPay = (selectedConfig || isCustom) && !loading

  async function handleRecharge() {
    setLoading(true); setError(null)
    const amountCents = selectedPill ? selectedPill.amount_cents : customCents
    const bonusCents = selectedPill ? selectedPill.bonus_cents : 0
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
    <div className="min-h-screen pb-16 max-w-lg mx-auto">
      <Navbar walletBalance={walletBalance} familyName={familyName} />

      <div className="px-4 pt-6">
        {/* Solde actuel */}
        <div className="rounded-xl p-5 mb-6 text-center" style={{ background: "var(--bg-alt)" }}>
          <img src={WALLET_IMG} alt="Panda Wallet" className="w-16 h-16 rounded-full object-cover mx-auto mb-2" />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Solde actuel</p>
          <p className="text-2xl font-bold" style={{ color: "var(--accent-2)" }}>{fmtPrice(walletBalance)}</p>
        </div>

        <h2 className="font-bold text-lg mb-4" style={{ color: "var(--ink)" }}>Recharger mon Panda Wallet</h2>

        {/* Pilules */}
        <div className="space-y-3 mb-6">
          {configs.map(c => {
            const isSelected = selectedConfig === c.id
            return (
              <button key={c.id}
                onClick={() => { setSelectedConfig(isSelected ? null : c.id); setCustomAmount("") }}
                className="w-full rounded-xl border p-4 text-left transition-all"
                style={{
                  borderColor: isSelected ? "var(--accent-2)" : "var(--border)",
                  background: isSelected ? "#F0FDF4" : "var(--card)",
                  boxShadow: isSelected ? "0 0 0 2px var(--accent-2)" : "none",
                }}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-lg font-bold" style={{ color: "var(--ink)" }}>{fmtPrice(c.amount_cents)}</span>
                    {c.bonus_cents > 0 && (
                      <span className="ml-2 text-sm font-semibold" style={{ color: "var(--accent-2)" }}>
                        +{fmtPrice(c.bonus_cents)} offerts
                      </span>
                    )}
                  </div>
                  <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: isSelected ? "var(--accent-2)" : "var(--border)" }}>
                    {isSelected && <div className="w-3 h-3 rounded-full" style={{ background: "var(--accent-2)" }} />}
                  </div>
                </div>
                {c.bonus_cents > 0 && <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>Crédit total : {fmtPrice(c.amount_cents + c.bonus_cents)}</p>}
              </button>
            )
          })}
        </div>

        {/* Champ libre */}
        <div className="rounded-xl border p-4 mb-6" style={{ borderColor: isCustom ? "var(--accent)" : "var(--border)", background: "var(--card)" }}>
          <label className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Montant libre (sans bonus)</label>
          <div className="flex items-center gap-2 mt-2">
            <input type="text" inputMode="decimal" value={customAmount}
              onChange={e => { setCustomAmount(e.target.value); setSelectedConfig(null) }}
              placeholder="Ex: 75" className="flex-1 h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--ink-soft)" }}>€</span>
          </div>
          <p className="text-[10px] mt-1" style={{ color: "var(--ink-soft)" }}>Min. 5 € · Max. 200 €</p>
        </div>

        {error && <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: "#FEF2F2", color: "#DC2626" }}>{error}</div>}

        <button onClick={handleRecharge} disabled={!canPay}
          className="w-full h-12 rounded-xl font-semibold text-white text-center text-sm disabled:opacity-50" style={{ background: "var(--accent-2)" }}>
          {loading ? "Redirection vers Stripe..." : `Recharger${selectedPill ? ` ${fmtPrice(selectedPill.amount_cents)}` : isCustom ? ` ${fmtPrice(customCents)}` : ""} par carte`}
        </button>

        <p className="text-sm text-center mt-4 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          Tu peux aussi recharger en espèces ou virement —{" "}
          <Link href="/contact" className="font-bold underline" style={{ color: "var(--accent)" }}>contacte-nous</Link>
        </p>
      </div>
    </div>
  )
}
