import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { createClient } from "@supabase/supabase-js"
import type Stripe from "stripe"

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || key === 'xxx') return null
  return createClient(url, key)
}

export async function POST(request: Request) {
  const stripe = getStripe()
  const supabaseAdmin = getSupabaseAdmin()

  if (!stripe || !supabaseAdmin) {
    return NextResponse.json({ error: "Service non configuré" }, { status: 503 })
  }

  const body = await request.text()
  const sig = request.headers.get("stripe-signature")

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error("Webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session

    // Only process panda_snack payments
    if (session.metadata?.product_line !== "panda_snack") {
      return NextResponse.json({ received: true })
    }

    const paymentIntentId = session.payment_intent as string

    // Idempotence check (BUG 14 FIX) — différent selon le type
    if (session.metadata?.type === "wallet_recharge" && paymentIntentId) {
      const { data: existing } = await supabaseAdmin
        .from("wallet_transactions")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .limit(1)

      if (existing && existing.length > 0) {
        console.log("Webhook recharge already processed for:", paymentIntentId)
        return NextResponse.json({ received: true, duplicate: true })
      }
    } else if (session.metadata?.type === "order_payment" && session.metadata?.order_id) {
      // Idempotence par order: si déjà paid, ne rien faire
      const { data: existing } = await supabaseAdmin
        .from("orders")
        .select("id, status")
        .eq("id", session.metadata.order_id)
        .single()

      if (existing && existing.status === "paid") {
        console.log("Webhook order already paid:", session.metadata.order_id)
        return NextResponse.json({ received: true, duplicate: true })
      }
    }

    if (session.metadata?.type === "wallet_recharge") {
      // ===== RECHARGE WALLET =====
      const accountId = session.metadata.account_id
      const amountCents = session.amount_total || 0
      const bonusCents = parseInt(session.metadata.bonus_cents || "0", 10)
      const totalCredit = amountCents + bonusCents

      let { data: wallet } = await supabaseAdmin
        .from("wallets")
        .select("id, balance_cents")
        .eq("account_id", accountId)
        .single()

      if (!wallet) {
        const { data: newWallet } = await supabaseAdmin
          .from("wallets")
          .insert({
            account_id: accountId,
            balance_cents: 0,
            expires_at: "2026-12-31T23:59:59Z",
          })
          .select()
          .single()
        wallet = newWallet
      }

      if (wallet) {
        const newBalance = wallet.balance_cents + totalCredit

        // FIX BUG 5: utiliser credit_purchase (existe dans l'enum) + stripe_payment_intent_id (bon nom de colonne)
        // + mettre à jour last_recharge_cents pour le pricing wallet
        await supabaseAdmin
          .from("wallets")
          .update({
            balance_cents: newBalance,
            last_recharge_cents: amountCents,
            updated_at: new Date().toISOString(),
          })
          .eq("id", wallet.id)

        await supabaseAdmin
          .from("wallet_transactions")
          .insert({
            wallet_id: wallet.id,
            type: "credit_purchase",
            amount_cents: totalCredit,
            balance_after_cents: newBalance,
            description: `Recharge CB ${(amountCents / 100).toFixed(2)} €${bonusCents > 0 ? ` + bonus ${(bonusCents / 100).toFixed(2)} €` : ""}`,
            stripe_payment_intent_id: paymentIntentId,
          })
      }

    } else if (session.metadata?.type === "order_payment") {
      // ===== FIX BUG 4: TRAITER LES COMMANDES CB =====
      const orderId = session.metadata.order_id

      if (orderId) {
        await supabaseAdmin
          .from("orders")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_checkout_session_id: session.id,
          })
          .eq("id", orderId)
          .eq("status", "pending_payment")
      }
    } else if (session.metadata?.type === "multi_order_payment") {
      // ===== Brief 3-E B-γ : multi-order payment (1 session Stripe pour N orders) =====
      const orderIdsCsv = session.metadata.order_ids || ""
      const orderIds = orderIdsCsv.split(",").map(s => s.trim()).filter(Boolean)
      if (orderIds.length > 0) {
        // Mark each order as paid (idempotent via .eq("status", "pending_payment"))
        for (const oid of orderIds) {
          await supabaseAdmin
            .from("orders")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              stripe_checkout_session_id: session.id,
            })
            .eq("id", oid)
            .eq("status", "pending_payment")
        }
      }
    }
  }

  return NextResponse.json({ received: true })
}
