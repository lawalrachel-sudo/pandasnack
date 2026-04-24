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

    if (session.metadata?.type === "wallet_recharge") {
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

        await supabaseAdmin
          .from("wallets")
          .update({ balance_cents: newBalance })
          .eq("id", wallet.id)

        await supabaseAdmin
          .from("wallet_transactions")
          .insert({
            wallet_id: wallet.id,
            type: "credit_stripe",
            amount_cents: totalCredit,
            balance_after_cents: newBalance,
            description: `Recharge CB ${(amountCents / 100).toFixed(2)} €${bonusCents > 0 ? ` + bonus ${(bonusCents / 100).toFixed(2)} €` : ""}`,
            stripe_payment_id: session.payment_intent as string,
          })
      }
    }
  }

  return NextResponse.json({ received: true })
}
