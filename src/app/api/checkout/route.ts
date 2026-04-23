import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"

// POST /api/checkout
// Body: { slotId, items: CartItem[], paymentMethod: "wallet" | "card" | "wallet_card" }
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
    }

    const body = await req.json()
    const { slotId, items, paymentMethod } = body as {
      slotId: string
      items: CheckoutItem[]
      paymentMethod: "wallet" | "card" | "wallet_card"
    }

    if (!slotId || !items?.length) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 })
    }

    // 1. Récupérer le compte
    const { data: account, error: accErr } = await supabase
      .from("accounts")
      .select("id")
      .eq("auth_user_id", user.id)
      .single()
    if (accErr || !account) {
      return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })
    }

    // 2. Calculer le total
    const subtotalCents = items.reduce((sum, i) => sum + i.priceCents * (i.quantity || 1), 0)
    const vatRate = 2.10
    const vatCents = Math.round(subtotalCents * vatRate / 100)
    const totalCents = subtotalCents + vatCents

    // 3. Récupérer le wallet si nécessaire
    let walletBalance = 0
    let walletId: string | null = null
    if (paymentMethod === "wallet" || paymentMethod === "wallet_card") {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("id, balance_cents")
        .eq("account_id", account.id)
        .single()
      if (wallet) {
        walletBalance = wallet.balance_cents
        walletId = wallet.id
      }
    }

    // 4. Déterminer le montant wallet vs card
    let walletDebitCents = 0
    let cardChargeCents = 0

    if (paymentMethod === "wallet" && walletBalance >= totalCents) {
      walletDebitCents = totalCents
      cardChargeCents = 0
    } else if (paymentMethod === "wallet_card" && walletBalance > 0) {
      walletDebitCents = Math.min(walletBalance, totalCents)
      cardChargeCents = totalCents - walletDebitCents
    } else {
      walletDebitCents = 0
      cardChargeCents = totalCents
    }

    // 5. Créer l'order
    const orderData: Record<string, unknown> = {
      account_id: account.id,
      service_slot_id: slotId,
      status: cardChargeCents > 0 ? "pending_payment" : "paid",
      subtotal_cents: subtotalCents,
      vat_rate: vatRate,
      vat_cents: vatCents,
      total_cents: totalCents,
      payment_method: paymentMethod,
      paid_at: cardChargeCents === 0 ? new Date().toISOString() : null,
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert(orderData)
      .select("id, order_number")
      .single()

    if (orderErr || !order) {
      console.error("Order creation error:", orderErr)
      return NextResponse.json({ error: "Erreur création commande" }, { status: 500 })
    }

    // 6. Créer les order_items
    const orderItems = items.map((item) => ({
      order_id: order.id,
      catalog_item_id: item.isFormula ? null : item.itemId,
      menu_formula_id: item.isFormula ? item.itemId : null,
      formula_choices: item.isFormula ? {
        plat_sku: item.selectedPlat,
        toppings: item.selectedToppings,
      } : null,
      topping_ids: item.selectedToppings?.length ? item.selectedToppings : null,
      quantity: item.quantity || 1,
      unit_price_cents: item.priceCents,
      line_total_cents: item.priceCents * (item.quantity || 1),
      profil_id: item.profilId || null,
      prenom_libre: item.profilPrenom || null,
      takeaway: item.isTakeaway || false,
      notes: item.itemName,
    }))

    const { error: itemsErr } = await supabase.from("order_items").insert(orderItems)
    if (itemsErr) {
      console.error("Order items error:", itemsErr)
      // Rollback order
      await supabase.from("orders").delete().eq("id", order.id)
      return NextResponse.json({ error: "Erreur ajout articles" }, { status: 500 })
    }

    // 7. Si wallet débit, effectuer la transaction
    if (walletDebitCents > 0 && walletId) {
      const newBalance = walletBalance - walletDebitCents

      const { data: wt, error: wtErr } = await supabase
        .from("wallet_transactions")
        .insert({
          wallet_id: walletId,
          type: "debit_order",
          amount_cents: -walletDebitCents,
          balance_after_cents: newBalance,
          order_id: order.id,
          description: `Commande ${order.order_number}`,
          created_by: user.id,
        })
        .select("id")
        .single()

      if (wtErr) {
        console.error("Wallet transaction error:", wtErr)
        // Cleanup
        await supabase.from("order_items").delete().eq("order_id", order.id)
        await supabase.from("orders").delete().eq("id", order.id)
        return NextResponse.json({ error: "Erreur débit wallet" }, { status: 500 })
      }

      // MAJ wallet balance
      await supabase
        .from("wallets")
        .update({
          balance_cents: newBalance,
          total_debited_cents: walletBalance - newBalance + walletDebitCents,
          updated_at: new Date().toISOString(),
        })
        .eq("id", walletId)

      // MAJ order avec wallet_transaction_id
      await supabase
        .from("orders")
        .update({ wallet_transaction_id: wt.id })
        .eq("id", order.id)
    }

    // 8. Si pas de charge CB → commande payée, retourner confirmation
    if (cardChargeCents === 0) {
      return NextResponse.json({
        success: true,
        orderId: order.id,
        orderNumber: order.order_number,
        redirect: `/confirmation?order=${order.id}`,
      })
    }

    // 9. Si charge CB nécessaire → créer Stripe Checkout Session
    // NOTE: Stripe en mode test. Si pas de clé configurée, on simule.
    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      // Simulation mode test — on passe directement en paid
      await supabase.from("orders").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_method: paymentMethod,
        stripe_checkout_session_id: "SIMULATED_TEST",
      }).eq("id", order.id)

      return NextResponse.json({
        success: true,
        orderId: order.id,
        orderNumber: order.order_number,
        redirect: `/confirmation?order=${order.id}`,
        simulated: true,
      })
    }

    // Stripe réel
    const stripe = require("stripe")(stripeKey)
    const origin = req.headers.get("origin") || "https://pandasnack-five.vercel.app"

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "eur",
          unit_amount: cardChargeCents,
          product_data: {
            name: `Commande Panda Snack ${order.order_number}`,
            description: `${items.length} article(s)`,
          },
        },
        quantity: 1,
      }],
      metadata: { order_id: order.id },
      success_url: `${origin}/confirmation?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/commander?cancelled=1`,
    })

    // Stocker le checkout session ID
    await supabase.from("orders").update({
      stripe_checkout_session_id: session.id,
    }).eq("id", order.id)

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      redirect: session.url,
      stripeSessionId: session.id,
    })

  } catch (err) {
    console.error("Checkout error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}

interface CheckoutItem {
  itemId: string
  itemName: string
  priceCents: number
  quantity?: number
  profilId: string | null
  profilPrenom: string
  isTakeaway: boolean
  isFormula: boolean
  formulaCode: string | null
  selectedPlat: string | null
  selectedToppings: string[]
}
