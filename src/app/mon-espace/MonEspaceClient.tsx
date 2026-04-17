"use client"

import { useState } from "react"
import { Navbar } from "@/components/Navbar"

interface Props {
  family: { id: string; name: string; email: string }
  wallet: { id: string; balance_cents: number; expires_at: string | null } | null
  transactions: Array<{
    id: string
    type: string
    amount_cents: number
    description: string | null
    created_at: string
  }>
  orders: Array<{
    id: string
    order_number: string
    status: string
    total_cents: number
    is_takeaway: boolean
    created_at: string
  }>
}

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  preparing: "En préparation",
  ready: "Prête",
  picked_up: "Récupérée",
  cancelled: "Annulée",
}

const TX_LABELS: Record<string, { label: string; sign: string; color: string }> = {
  credit_stripe: { label: "Recharge", sign: "+", color: "var(--accent-2)" },
  credit_manual: { label: "Crédit manuel", sign: "+", color: "var(--accent-2)" },
  debit_order: { label: "Commande", sign: "-", color: "var(--accent)" },
  debit_snack: { label: "Snack shop", sign: "-", color: "var(--accent-3)" },
  refund: { label: "Remboursement", sign: "+", color: "var(--accent-2)" },
}

export function MonEspaceClient({ family, wallet, transactions, orders }: Props) {
  const [tab, setTab] = useState<"wallet" | "orders">("wallet")
  const [rechargeAmount, setRechargeAmount] = useState("")

  const balance = wallet ? (wallet.balance_cents / 100).toFixed(2).replace('.', ',') : "0,00"

  async function handleRecharge() {
    const amount = parseFloat(rechargeAmount.replace(',', '.'))
    if (isNaN(amount) || amount < 10) {
      alert("Montant minimum : 10 €")
      return
    }
    // Redirect to Stripe checkout
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_cents: Math.round(amount * 100),
        family_id: family.id,
      }),
    })
    const { url } = await res.json()
    if (url) window.location.href = url
  }

  return (
    <div className="min-h-screen">
      <Navbar walletBalance={wallet?.balance_cents} familyName={family.name} />

      {/* Wallet card */}
      <div className="px-4 py-6">
        <div
          className="rounded-2xl p-6 text-white text-center"
          style={{ background: `linear-gradient(135deg, var(--menu-panda-start), var(--menu-panda-end))` }}
        >
          <p className="text-sm opacity-80 mb-1">Pass Panda · {family.name}</p>
          <p className="text-4xl font-bold">{balance} €</p>
          {wallet?.expires_at && (
            <p className="text-xs opacity-70 mt-2">
              Expire le {new Date(wallet.expires_at).toLocaleDateString("fr-FR")}
            </p>
          )}
        </div>

        {/* Recharge */}
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={rechargeAmount}
            onChange={(e) => setRechargeAmount(e.target.value)}
            placeholder="Montant (min. 10 €)"
            className="flex-1 h-12 px-4 rounded-xl border text-base outline-none"
            style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
          />
          <button
            onClick={handleRecharge}
            className="h-12 px-6 rounded-xl font-semibold text-white"
            style={{ background: 'var(--accent)' }}
          >
            Recharger
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 flex gap-1 mb-4">
        {(["wallet", "orders"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === t ? "text-white" : ""
            }`}
            style={tab === t ? { background: 'var(--accent)' } : { background: 'var(--bg-alt)' }}
          >
            {t === "wallet" ? "Historique wallet" : "Mes commandes"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-4 pb-8">
        {tab === "wallet" && (
          <div className="space-y-2">
            {transactions.length === 0 && (
              <p className="text-sm text-center py-6" style={{ color: 'var(--ink-soft)' }}>
                Aucune transaction pour le moment.
              </p>
            )}
            {transactions.map(tx => {
              const meta = TX_LABELS[tx.type] || { label: tx.type, sign: "", color: "var(--ink)" }
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-xl border"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div>
                    <p className="text-sm font-medium">{meta.label}</p>
                    {tx.description && (
                      <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{tx.description}</p>
                    )}
                    <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                      {new Date(tx.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <span className="font-bold" style={{ color: meta.color }}>
                    {meta.sign}{(tx.amount_cents / 100).toFixed(2).replace('.', ',')} €
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {tab === "orders" && (
          <div className="space-y-2">
            {orders.length === 0 && (
              <p className="text-sm text-center py-6" style={{ color: 'var(--ink-soft)' }}>
                Aucune commande pour le moment.
              </p>
            )}
            {orders.map(order => (
              <div
                key={order.id}
                className="p-3 rounded-xl border"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm">{order.order_number}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--bg-alt)' }}
                  >
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </div>
                <div className="flex justify-between mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                  <span>{new Date(order.created_at).toLocaleDateString("fr-FR")}</span>
                  <span className="font-bold" style={{ color: 'var(--ink)' }}>
                    {(order.total_cents / 100).toFixed(2).replace('.', ',')} €
                  </span>
                </div>
                {order.is_takeaway && (
                  <span className="text-xs mt-1 inline-block" style={{ color: 'var(--accent-3)' }}>
                    📦 À emporter
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
