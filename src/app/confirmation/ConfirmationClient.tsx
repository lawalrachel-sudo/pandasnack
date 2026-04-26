"use client"

import Link from "next/link"

const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776714727/PANDA_WALLET.jpg"

function fmtPrice(c: number): string { return `${(c / 100).toFixed(2).replace(".", ",")} €` }
function fmtDate(d: string): string {
  const dt = new Date(d + "T12:00:00")
  const wd = dt.toLocaleDateString("fr-FR", { weekday: "long" })
  const dm = dt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`
}

interface Props {
  order: {
    id: string; order_number: string; status: string; total_cents: number
    subtotal_cents: number; vat_cents: number; payment_method: string
    created_at: string; paid_at: string | null
    service_slots: { service_date: string; day_type: string; delivery_points: { name: string } | null }
  }
  items: Array<{
    id: string; notes: string; quantity: number; unit_price_cents: number
    line_total_cents: number; takeaway: boolean; prenom_libre: string | null
    profils: { prenom: string } | null
  }>
}

export function ConfirmationClient({ order, items }: Props) {
  const isPaid = order.status === "paid"
  const serviceDate = order.service_slots?.service_date
  const deliveryName = order.service_slots?.delivery_points?.name

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl"
          style={{ background: isPaid ? "#E8F5E9" : "#FFF3E0" }}>
          {isPaid ? "✅" : "⏳"}
        </div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--ink)" }}>
          {isPaid ? "Commande confirmée !" : "En attente de paiement"}
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--ink-soft)" }}>
          Commande n° <strong>{order.order_number}</strong>
        </p>
      </div>

      {/* Infos livraison */}
      {serviceDate && (
        <div className="rounded-xl p-4 mb-4" style={{ background: "var(--bg-alt)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            📅 {fmtDate(serviceDate)}
          </p>
          {deliveryName && (
            <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>📍 {deliveryName}</p>
          )}
        </div>
      )}

      {/* Articles */}
      <div className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-bold text-sm mb-3" style={{ color: "var(--ink)" }}>Détail de la commande</h2>
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.notes}</p>
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  Pour : {item.profils?.prenom || item.prenom_libre || "—"}
                  {item.takeaway && " · À emporter"}
                </p>
              </div>
              <p className="text-sm font-semibold shrink-0">{fmtPrice(item.line_total_cents)}</p>
            </div>
          ))}
        </div>
        <div className="border-t mt-3 pt-3 space-y-1" style={{ borderColor: "var(--border)" }}>
          <div className="flex justify-between text-xs" style={{ color: "var(--ink-soft)" }}>
            <span>Sous-total</span><span>{fmtPrice(order.subtotal_cents)}</span>
          </div>
          <div className="flex justify-between text-xs" style={{ color: "var(--ink-soft)" }}>
            <span>TVA ({2.10}%)</span><span>{fmtPrice(order.vat_cents)}</span>
          </div>
          <div className="flex justify-between font-bold text-base pt-1">
            <span>Total</span><span>{fmtPrice(order.total_cents)}</span>
          </div>
        </div>
        {order.payment_method && (
          <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: "var(--ink-soft)" }}>
            {order.payment_method.includes("wallet") && (
              <img src={WALLET_IMG} alt="Wallet" className="w-5 h-5 rounded-full object-cover" />
            )}
            <span>
              {order.payment_method === "wallet" && "Payé par Panda Wallet"}
              {order.payment_method === "card" && "Payé par carte"}
              {order.payment_method === "wallet_card" && "Wallet + complément carte"}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3 mt-6">
        <Link href="/mes-commandes" className="block w-full h-12 rounded-xl font-semibold text-white text-center leading-[3rem]" style={{ background: "var(--accent)" }}>
          Voir mes commandes
        </Link>
        <Link href="/commander" className="block w-full h-12 rounded-xl font-semibold text-center leading-[3rem] border" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
          Commander pour un autre jour
        </Link>
      </div>

      {/* Info cutoff */}
      <div className="mt-6 rounded-xl p-4 text-xs" style={{ background: "#FEF3E2", color: "var(--ink)" }}>
        <strong>Rappel :</strong> Tu peux modifier ou annuler ta commande jusqu'à la veille 20h. 
        Après ce délai, la commande est ferme et ne peut plus être remboursée.
      </div>
    </div>
  )
}
