import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { createClient } from "@supabase/supabase-js"
import type Stripe from "stripe"

// Use service role for webhook (no user context)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
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
      const familyId = session.metadata.family_id
      const amountCents = session.amount_total || 0

      // Get or create wallet
      let { data: wallet } = await supabaseAdmin
        .from("wallets")
        .select("id, balance_cents")
        .eq("family_id", familyId)
        .single()

      if (!wallet) {
        const { data: newWallet } = await supabaseAdmin
          .from("wallets")
          .insert({
            family_id: familyId,
            balance_cents: 0,
            expires_at: "2026-06-30T23:59:59Z",
          })
          .select()
          .single()
        wallet = newWallet
      }

      if (wallet) {
        // Credit wallet
        await supabaseAdmin
          .from("wallets")
          .update({ balance_cents: wallet.balance_cents + amountCents })
          .eq("id", wallet.id)

        // Record transaction
        await supabaseAdmin
          .from("wallet_transactions")
          .insert({
            wallet_id: wallet.id,
            type: "credit_stripe",
            amount_cents: amountCents,
            description: `Recharge Stripe — ${(amountCents / 100).toFixed(2)} €`,
            stripe_payment_id: session.payment_intent as string,
          })
      }
    }
  }

  return NextResponse.json({ received: true })
}
