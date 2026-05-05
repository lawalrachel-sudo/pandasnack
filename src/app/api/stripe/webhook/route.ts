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
    console.error("[Stripe webhook] signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Bug 6 — idempotence GLOBALE par event.id (Stripe retry les events 5xx jusqu'à 3 jours)
  // Insert with primary key conflict = event déjà processed → skip silently.
  const sessionForLog = event.type === "checkout.session.completed"
    ? (event.data.object as Stripe.Checkout.Session).id
    : null
  const { error: dupErr } = await supabaseAdmin
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, event_type: event.type, session_id: sessionForLog })
  if (dupErr) {
    // Code 23505 = unique_violation → c'est un retry, déjà traité
    if ((dupErr as { code?: string }).code === "23505") {
      console.log(`[Stripe webhook] duplicate event ${event.id} (${event.type}) — skipped`)
      return NextResponse.json({ received: true, duplicate: true })
    }
    console.error(`[Stripe webhook] failed to log event ${event.id}:`, dupErr)
    // Continue quand même — ne pas bloquer le traitement
  }

  console.log(`[Stripe webhook] event ${event.id} (${event.type})`)

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
        const { data: updated, error: upErr } = await supabaseAdmin
          .from("orders")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_checkout_session_id: session.id,
          })
          .eq("id", orderId)
          .eq("status", "pending_payment")
          .select("id, status")
        if (upErr) console.error(`[Stripe webhook] order_payment ${orderId} update FAILED:`, upErr)
        else console.log(`[Stripe webhook] order_payment ${orderId} → paid (rows=${updated?.length ?? 0})`)
      } else {
        console.warn(`[Stripe webhook] order_payment session=${session.id} HAS NO order_id in metadata`)
      }
    } else if (session.metadata?.type === "multi_order_payment") {
      // ===== Brief 3-E B-γ : multi-order payment (1 session Stripe pour N orders) =====
      const orderIdsCsv = session.metadata.order_ids || ""
      const orderIds = orderIdsCsv.split(",").map(s => s.trim()).filter(Boolean)
      console.log(`[Stripe webhook] multi_order_payment session=${session.id} orderIds=[${orderIds.join(",")}]`)
      if (orderIds.length === 0) {
        console.warn(`[Stripe webhook] multi_order_payment session=${session.id} HAS NO order_ids in metadata`)
      }
      // Mark each order as paid (idempotent via .eq("status", "pending_payment")).
      // Bug 6 — log précis par order : status avant + nb rows touchées par l'UPDATE.
      for (const oid of orderIds) {
        const { data: before } = await supabaseAdmin
          .from("orders").select("id, status").eq("id", oid).single()
        if (!before) {
          console.error(`[Stripe webhook] order ${oid} introuvable (session ${session.id})`)
          continue
        }
        if (before.status === "paid") {
          console.log(`[Stripe webhook] order ${oid} déjà paid → skip`)
          continue
        }
        const { data: updated, error: upErr } = await supabaseAdmin
          .from("orders")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_checkout_session_id: session.id,
          })
          .eq("id", oid)
          .eq("status", "pending_payment")
          .select("id, status")
        if (upErr) {
          console.error(`[Stripe webhook] order ${oid} update FAILED:`, upErr)
        } else {
          console.log(`[Stripe webhook] order ${oid} ${before.status} → paid (rows=${updated?.length ?? 0})`)
        }
      }
    } else {
      console.log(`[Stripe webhook] session ${session.id} type unknown:`, session.metadata?.type)
    }
  }

  return NextResponse.json({ received: true })
}
