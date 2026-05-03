import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"

// POST /api/checkout-multi — Brief 3-E B-γ : paiement multi-orders en 1 session Stripe
// Body: { orderIds: string[], paymentMethod: "wallet" | "card" | "wallet_card" }
// Process : RPC process_order_payment pour chaque order (cascade wallet) puis 1 session Stripe avec metadata { type: "multi_order_payment", panda_id, order_ids: csv }

interface PaymentResult {
  order_id: string
  order_number: string
  wallet_debit_cents: number
  card_charge_cents: number
  new_status: "paid" | "pending_payment"
  wallet_transaction_id: string | null
  wallet_balance_after: number
}

export async function POST(req: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

    const { orderIds, paymentMethod } = await req.json() as {
      orderIds: string[]
      paymentMethod: "wallet" | "card" | "wallet_card"
    }

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: "Aucune commande sélectionnée" }, { status: 400 })
    }
    if (!paymentMethod || !["wallet", "card", "wallet_card"].includes(paymentMethod)) {
      return NextResponse.json({ error: "Mode de paiement invalide" }, { status: 400 })
    }

    // Get account + panda_id (pour metadata Stripe)
    const { data: account } = await supabase
      .from("accounts").select("id, panda_id").eq("auth_user_id", user.id).single()
    if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })

    // Process each order via RPC (cascade wallet → some may be paid immediately, others need card)
    const results: PaymentResult[] = []
    for (const orderId of orderIds) {
      const { data: rpcResult, error: rpcErr } = await supabase.rpc("process_order_payment", {
        p_order_id: orderId,
        p_payment_method: paymentMethod,
      })
      if (rpcErr || !rpcResult || rpcResult.length === 0) {
        console.error(`Multi-checkout RPC error on ${orderId}:`, rpcErr?.message)
        // Skip this order, keep going (partial success acceptable)
        continue
      }
      results.push(rpcResult[0] as PaymentResult)
    }

    if (results.length === 0) {
      return NextResponse.json({ error: "Aucune commande traitée" }, { status: 500 })
    }

    const totalCardCharge = results.reduce((s, r) => s + (r.card_charge_cents || 0), 0)
    const totalWalletDebit = results.reduce((s, r) => s + (r.wallet_debit_cents || 0), 0)
    const needCardOrders = results.filter(r => r.card_charge_cents > 0)
    const firstOrderId = results[0].order_id

    // CASE 1 — toutes payées par wallet, pas besoin Stripe
    if (totalCardCharge === 0) {
      return NextResponse.json({
        success: true,
        paidCount: results.length,
        totalWalletDebit,
        redirect: `/confirmation?order=${firstOrderId}`,
      })
    }

    // CASE 2 — Stripe needed (1 session pour toutes les orders qui ont card_charge > 0)
    const stripeKey = process.env.STRIPE_SECRET_KEY

    // TEST mode (no Stripe key) → mark all need-card orders as paid immédiatement
    if (!stripeKey) {
      for (const r of needCardOrders) {
        await supabase.from("orders")
          .update({ status: "paid", paid_at: new Date().toISOString(), stripe_checkout_session_id: "SIMULATED_TEST_MULTI" })
          .eq("id", r.order_id).eq("status", "pending_payment")
      }
      return NextResponse.json({
        success: true,
        paidCount: results.length,
        totalCardCharge,
        totalWalletDebit,
        redirect: `/confirmation?order=${firstOrderId}`,
        simulated: true,
      })
    }

    // Real Stripe flow
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const stripe = require("stripe")(stripeKey)
    const origin = req.headers.get("origin") || "https://pandasnack-five.vercel.app"

    // Build line_items : 1 line par order avec card_charge > 0
    const lineItems = needCardOrders.map(r => {
      const walletNote = r.wallet_debit_cents > 0
        ? ` · Wallet utilisé : ${(r.wallet_debit_cents / 100).toFixed(2).replace(".", ",")} €`
        : ""
      return {
        price_data: {
          currency: "eur",
          unit_amount: r.card_charge_cents,
          product_data: {
            name: `Commande Panda Snack ${r.order_number}`,
            description: walletNote || undefined,
          },
        },
        quantity: 1,
      }
    })

    const orderIdsCsv = needCardOrders.map(r => r.order_id).join(",")
    // Idempotency : key basée sur orderIds csv + total card pour éviter doublons
    const idempotencyKey = `multi-${orderIdsCsv}-${totalCardCharge}`

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: lineItems,
        metadata: {
          product_line: "panda_snack",
          type: "multi_order_payment",
          panda_id: account.panda_id || "",
          account_id: account.id,
          order_ids: orderIdsCsv,
          wallet_debit_total_cents: String(totalWalletDebit),
        },
        success_url: `${origin}/confirmation?order=${firstOrderId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/panier?cancelled=1`,
      },
      { idempotencyKey }
    )

    // Save Stripe session ID pour chaque order needCard (webhook reconciliation)
    for (const r of needCardOrders) {
      await supabase.from("orders")
        .update({ stripe_checkout_session_id: session.id })
        .eq("id", r.order_id)
    }

    return NextResponse.json({
      success: true,
      paidCount: results.length,
      totalCardCharge,
      totalWalletDebit,
      redirect: session.url,
      stripeSessionId: session.id,
    })
  } catch (err) {
    console.error("Checkout-multi error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
