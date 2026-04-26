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
  active: boolean
}

interface Props {
  accountId: string
  familyName: string
  walletBalance: number
  configs: Config[]
  currentMenuPriceCents: number
  lastRechargeCents: number
}

function fmtPrice(c: number): string { return `${(c / 100).toFixed(2).replace(".", ",")} €` }

function getMenuPriceForRecharge(rechargeCents: number): number {
  if (rechargeCents >= 10000) return 800
  if (rechargeCents >= 5000) return 900
  return 1000
}

function getDiscountLabel(rechargeCents: number): string {
  if (rechargeCents >= 10000) return "-20%"
  if (rechargeCents >= 5000) return "-10%"
  return ""
}

export function RechargerClient({ accountId, familyName, walletBalance, configs, currentMenuPriceCents, lastRechargeCents }: Props) {
  const [selectedRecharge, setSelectedRecharge] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedConfig = configs.find(c => c.recharge_cents === selectedRecharge)
  const customCents = customAmount ? Math.round(parseFloat(customAmount.replace(",", ".")) * 100) : 0
  const isCustom = !selectedRecharge && customCents > 0
  const canPay = (selectedRecharge || isCustom) && !loading

  // Prix menu après la recharge sélectionnée
  const previewMenuPrice = selectedRecharge ? getMenuPriceForRecharge(selectedRecharge) : currentMenuPriceCents

  async function handleRecharge() {
    setLoading(true); setError(null)
    const amountCents = selectedConfig ? selectedConfig.recharge_cents : customCents
    const bonusCents = selectedConfig ? selectedConfig.bonus_cents : 0
    if (amountCents > 20000) { setError("Pour un montant supérieur à 200 €, contactez team@pandasnack.online"); setLoading(false); return }
    if (amountCents < 500) { setError("Montant minimum : 5 €"); setLoading(false); return }
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
        {/* Solde actuel + palier */}
        <div className="rounded-xl p-5 mb-4 text-center" style={{ background: "var(--bg-alt)" }}>
          <img src={WALLET_IMG} alt="Panda Wallet" className="w-16 h-16 rounded-full object-cover mx-auto mb-2" />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Solde actuel</p>
          <p className="text-2xl font-bold" style={{ color: "var(--accent-2)" }}>{fmtPrice(walletBalance)}</p>
          {lastRechargeCents > 0 && (
            <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
              Tes menus à {fmtPrice(currentMenuPriceCents)} ({getDiscountLabel(lastRechargeCents)})
            </p>
          )}
        </div>

        {/* Explication wallet */}
        <div className="rounded-xl border p-4 mb-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--ink)" }}>Comment ça marche ?</p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Recharge ton Panda Wallet et profite de prix réduits sur tes menus et bentos.
            Plus tu recharges, plus le prix baisse. Le tarif est déterminé par ta dernière recharge.
          </p>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span style={{ color: "var(--ink-soft)" }}>Sans recharge (CB)</span>
              <span className="font-semibold">10,00 € / menu</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: "var(--accent-2)" }}>Recharge 50 €</span>
              <span className="font-semibold" style={{ color: "var(--accent-2)" }}>9,00 € / menu (-10%)</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: "var(--accent-2)" }}>Recharge 100 €</span>
              <span className="font-semibold" style={{ color: "var(--accent-2)" }}>8,00 € / menu (-20%)</span>
            </div>
          </div>
        </div>

        <h2 className="font-bold text-lg mb-4" style={{ color: "var(--ink)" }}>Recharger mon Panda Wallet</h2>

        {/* Pilules avec remises */}
        <div className="space-y-3 mb-6">
          {configs.map(c => {
            const isSelected = selectedRecharge === c.recharge_cents
            const menuPrice = getMenuPriceForRecharge(c.recharge_cents)
            const discount = getDiscountLabel(c.recharge_cents)
            const isBest = c.recharge_cents === 10000

            return (
              <button key={c.recharge_cents}
                onClick={() => { setSelectedRecharge(isSelected ? null : c.recharge_cents); setCustomAmount("") }}
                className="w-full rounded-xl border p-4 text-left transition-all relative"
                style={{
                  borderColor: isSelected ? "var(--accent-2)" : "var(--border)",
                  background: isSelected ? "#F0FDF4" : "var(--card)",
                  boxShadow: isSelected ? "0 0 0 2px var(--accent-2)" : "none",
                }}>
                {isBest && (
                  <span className="absolute -top-2 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "var(--accent-2)" }}>
                    Meilleure offre
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-lg font-bold" style={{ color: "var(--ink)" }}>{fmtPrice(c.recharge_cents)}</span>
                    {discount && (
                      <span className="ml-2 text-sm font-semibold" style={{ color: "var(--accent-2)" }}>{discount}</span>
                    )}
                  </div>
                  <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: isSelected ? "var(--accent-2)" : "var(--border)" }}>
                    {isSelected && <div className="w-3 h-3 rounded-full" style={{ background: "var(--accent-2)" }} />}
                  </div>
                </div>
                <p className="text-sm mt-1 font-medium" style={{ color: "var(--accent-2)" }}>
                  Tes menus à {fmtPrice(menuPrice)}
                </p>
                {c.bonus_cents > 0 && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                    {c.bonus_label || `+${fmtPrice(c.bonus_cents)} offerts`} — crédit total : {fmtPrice(c.total_credit_cents)}
                  </p>
                )}
              </button>
            )
          })}
        </div>

        {/* Champ libre */}
        <div className="rounded-xl border p-4 mb-6" style={{ borderColor: isCustom ? "var(--accent)" : "var(--border)", background: "var(--card)" }}>
          <label className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Montant libre (sans bonus, menus à 10 €)</label>
          <div className="flex items-center gap-2 mt-2">
            <input type="text" inputMode="decimal" value={customAmount}
              onChange={e => { setCustomAmount(e.target.value); setSelectedRecharge(null) }}
              placeholder="Ex: 75" className="flex-1 h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--ink-soft)" }}>€</span>
          </div>
          <p className="text-[10px] mt-1" style={{ color: "var(--ink-soft)" }}>Min. 5 € · Max. 200 € · Au-delà : team@pandasnack.online</p>
        </div>

        {error && <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: "#FEF2F2", color: "#DC2626" }}>{error}</div>}

        <button onClick={handleRecharge} disabled={!canPay}
          className="w-full h-12 rounded-xl font-semibold text-white text-center text-sm disabled:opacity-50" style={{ background: "var(--accent-2)" }}>
          {loading ? "Redirection vers Stripe..." : `Recharger${selectedConfig ? ` ${fmtPrice(selectedConfig.recharge_cents)}` : isCustom ? ` ${fmtPrice(customCents)}` : ""} par carte`}
        </button>

        <p className="text-sm text-center mt-4 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          Tu peux aussi recharger en espèces ou virement —{" "}
          <Link href="/contact" className="font-bold underline" style={{ color: "var(--accent)" }}>contacte-nous</Link>
        </p>
      </div>
    </div>
  )
}
