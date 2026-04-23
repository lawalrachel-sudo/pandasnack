import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
    const { slotId, items, paymentMethod } = await req.json()
    if (!slotId || !items?.length) return NextResponse.json({ error: "Données manquantes" }, { status: 400 })
    const { data: account } = await supabase.from("accounts").select("id").eq("auth_user_id", user.id).single()
    if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })
    const subtotalCents = items.reduce((sum: number, i: any) => sum + i.priceCents * (i.quantity || 1), 0)
    const vatRate = 2.10; const vatCents = Math.round(subtotalCents * vatRate / 100); const totalCents = subtotalCents + vatCents
    let walletBalance = 0, walletId: string | null = null
    if (paymentMethod === "wallet" || paymentMethod === "wallet_card") { const { data: w } = await supabase.from("wallets").select("id, balance_cents").eq("account_id", account.id).single(); if (w) { walletBalance = w.balance_cents; walletId = w.id } }
    let walletDebitCents = 0, cardChargeCents = 0
    if (paymentMethod === "wallet" && walletBalance >= totalCents) { walletDebitCents = totalCents } else if (paymentMethod === "wallet_card" && walletBalance > 0) { walletDebitCents = Math.min(walletBalance, totalCents); cardChargeCents = totalCents - walletDebitCents } else { cardChargeCents = totalCents }
    const { data: order, error: orderErr } = await supabase.from("orders").insert({ account_id: account.id, service_slot_id: slotId, status: cardChargeCents > 0 ? "pending_payment" : "paid", subtotal_cents: subtotalCents, vat_rate: vatRate, vat_cents: vatCents, total_cents: totalCents, payment_method: paymentMethod, paid_at: cardChargeCents === 0 ? new Date().toISOString() : null }).select("id, order_number").single()
    if (orderErr || !order) return NextResponse.json({ error: "Erreur création commande" }, { status: 500 })
    const orderItems = items.map((i: any) => ({ order_id: order.id, catalog_item_id: i.isFormula ? null : i.itemId, menu_formula_id: i.isFormula ? i.itemId : null, formula_choices: i.isFormula ? { plat_sku: i.selectedPlat, toppings: i.selectedToppings } : null, topping_ids: i.selectedToppings?.length ? i.selectedToppings : null, quantity: i.quantity || 1, unit_price_cents: i.priceCents, line_total_cents: i.priceCents * (i.quantity || 1), profil_id: i.profilId || null, prenom_libre: i.profilPrenom || null, takeaway: i.isTakeaway || false, notes: i.itemName }))
    const { error: itemsErr } = await supabase.from("order_items").insert(orderItems)
    if (itemsErr) { await supabase.from("orders").delete().eq("id", order.id); return NextResponse.json({ error: "Erreur ajout articles" }, { status: 500 }) }
    if (walletDebitCents > 0 && walletId) { const nb = walletBalance - walletDebitCents; const { data: wt } = await supabase.from("wallet_transactions").insert({ wallet_id: walletId, type: "debit_order", amount_cents: -walletDebitCents, balance_after_cents: nb, order_id: order.id, description: "Commande " + order.order_number, created_by: user.id }).select("id").single(); await supabase.from("wallets").update({ balance_cents: nb, updated_at: new Date().toISOString() }).eq("id", walletId); if (wt) await supabase.from("orders").update({ wallet_transaction_id: wt.id }).eq("id", order.id) }
    if (cardChargeCents === 0) return NextResponse.json({ success: true, orderId: order.id, orderNumber: order.order_number, redirect: "/confirmation?order=" + order.id })
    const sk = process.env.STRIPE_SECRET_KEY
    if (!sk) { await supabase.from("orders").update({ status: "paid", paid_at: new Date().toISOString(), stripe_checkout_session_id: "SIMULATED_TEST" }).eq("id", order.id); return NextResponse.json({ success: true, orderId: order.id, redirect: "/confirmation?order=" + order.id, simulated: true }) }
    const stripe = require("stripe")(sk); const origin = req.headers.get("origin") || "https://pandasnack-five.vercel.app"
    const session = await stripe.checkout.sessions.create({ mode: "payment", payment_method_types: ["card"], line_items: [{ price_data: { currency: "eur", unit_amount: cardChargeCents, product_data: { name: "Commande Panda Snack " + order.order_number } }, quantity: 1 }], metadata: { order_id: order.id }, success_url: origin + "/confirmation?order=" + order.id + "&session_id={CHECKOUT_SESSION_ID}", cancel_url: origin + "/commander?cancelled=1" })
    await supabase.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id)
    return NextResponse.json({ success: true, orderId: order.id, redirect: session.url })
  } catch (err) { console.error("Checkout error:", err); return NextResponse.json({ error: "Erreur serveur" }, { status: 500 }) }
}
