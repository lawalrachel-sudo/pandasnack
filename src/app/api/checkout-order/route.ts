import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"
import { resolveOrigin } from "@/lib/origin"

// POST /api/checkout-order
// Body: { orderId: string, paymentMethod: "wallet" | "card" | "wallet_card" }
// Pays an existing order. Wallet+order updates are done atomically via RPC.

interface PaymentResult {
  order_id: string
  order_number: string
  wallet_debit_cents: number
  card_charge_cents: number
  new_status: "paid" | "pending_payment"
  wallet_transaction_id: string | null
  wallet_balance_after: number
}

// Map RPC errors to user-friendly messages + HTTP codes
function mapRpcError(message: string): { status: number; error: string; code: string } {
  if (message.includes("INSUFFICIENT_WALLET_BALANCE")) {
    return {
      status: 400,
      error: "Solde wallet insuffisant. Recharge ton wallet ou choisis un autre mode de paiement.",
      code: "INSUFFICIENT_WALLET_BALANCE",
    }
  }
  if (message.includes("CUTOFF_PASSED")) {
    return {
      status: 400,
      error: "L'heure limite de commande pour ce jour est passée (veille 20h).",
      code: "CUTOFF_PASSED",
    }
  }
  if (message.includes("ORDER_NOT_FOUND_OR_ALREADY_PAID")) {
    return {
      status: 404,
      error: "Commande introuvable ou déjà payée.",
      code: "ORDER_NOT_FOUND_OR_ALREADY_PAID",
    }
  }
  if (message.includes("WALLET_NOT_FOUND")) {
    return {
      status: 404,
      error: "Aucun wallet trouvé pour ce compte.",
      code: "WALLET_NOT_FOUND",
    }
  }
  if (message.includes("NOT_AUTHENTICATED") || message.includes("ACCOUNT_NOT_FOUND")) {
    return { status: 401, error: "Non authentifié", code: "NOT_AUTHENTICATED" }
  }
  if (message.includes("INVALID_PAYMENT_METHOD")) {
    return { status: 400, error: "Mode de paiement invalide", code: "INVALID_PAYMENT_METHOD" }
  }
  return { status: 500, error: "Erreur serveur", code: "UNKNOWN" }
}

export async function POST(req: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
    }

    const body = await req.json()
    const { orderId, paymentMethod } = body as {
      orderId: string
      paymentMethod: "wallet" | "card" | "wallet_card"
    }

    if (!orderId || !paymentMethod) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 })
    }

    if (!["wallet", "card", "wallet_card"].includes(paymentMethod)) {
      return NextResponse.json({ error: "Mode de paiement invalide" }, { status: 400 })
    }

    // ========================================================================
    // ATOMIC PAYMENT PROCESSING via RPC
    // ========================================================================
    const { data: rpcResult, error: rpcErr } = await supabase.rpc("process_order_payment", {
      p_order_id: orderId,
      p_payment_method: paymentMethod,
    })

    if (rpcErr) {
      const mapped = mapRpcError(rpcErr.message || "")
      console.error("RPC process_order_payment error:", rpcErr.message, "→", mapped.code)
      return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status })
    }

    if (!rpcResult || rpcResult.length === 0) {
      return NextResponse.json({ error: "Aucun résultat du traitement" }, { status: 500 })
    }

    const result = rpcResult[0] as PaymentResult

    // ========================================================================
    // CASE 1: Fully paid by wallet → direct redirect to confirmation
    // ========================================================================
    if (result.card_charge_cents === 0) {
      return NextResponse.json({
        success: true,
        orderId: result.order_id,
        orderNumber: result.order_number,
        walletDebitCents: result.wallet_debit_cents,
        walletBalanceAfter: result.wallet_balance_after,
        redirect: `/confirmation?order=${result.order_id}`,
      })
    }

    // ========================================================================
    // CASE 2: Card charge required → Stripe Checkout Session
    // ========================================================================
    const stripeKey = process.env.STRIPE_SECRET_KEY

    // TEST mode: simulate immediate payment if no Stripe key configured
    if (!stripeKey) {
      // Mark order paid (idempotently) — in test mode only
      await supabase
        .from("orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_checkout_session_id: "SIMULATED_TEST",
        })
        .eq("id", result.order_id)
        .eq("status", "pending_payment") // idempotency guard

      return NextResponse.json({
        success: true,
        orderId: result.order_id,
        orderNumber: result.order_number,
        walletDebitCents: result.wallet_debit_cents,
        cardChargeCents: result.card_charge_cents,
        redirect: `/confirmation?order=${result.order_id}`,
        simulated: true,
      })
    }

    // Real Stripe flow
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const stripe = require("stripe")(stripeKey)
    // P0 #4 — origin whitelist (cf src/lib/origin.ts), pas de Host header spoofable
    const origin = resolveOrigin(req.headers.get("origin"))

    // Get item count for Stripe description (best-effort, not blocking)
    const { count: itemCount } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", result.order_id)

    // Idempotency key prevents duplicate Stripe sessions on double-click
    const idempotencyKey = `order-${result.order_id}-${result.card_charge_cents}`

    const walletNote = result.wallet_debit_cents > 0
      ? ` · Wallet utilisé : ${(result.wallet_debit_cents / 100).toFixed(2).replace(".", ",")} €`
      : ""

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "eur",
              unit_amount: result.card_charge_cents,
              product_data: {
                name: `Commande Panda Snack ${result.order_number}`,
                description: `${itemCount ?? "?"} article(s)${walletNote}`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          product_line: "panda_snack",
          type: "order_payment",
          order_id: result.order_id,
          wallet_debit_cents: String(result.wallet_debit_cents),
        },
        success_url: `${origin}/confirmation?order=${result.order_id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout?order=${result.order_id}&cancelled=1`,
      },
      {
        idempotencyKey,
      }
    )

    // Save Stripe session ID for webhook reconciliation
    await supabase
      .from("orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", result.order_id)

    return NextResponse.json({
      success: true,
      orderId: result.order_id,
      orderNumber: result.order_number,
      walletDebitCents: result.wallet_debit_cents,
      cardChargeCents: result.card_charge_cents,
      redirect: session.url,
      stripeSessionId: session.id,
    })
  } catch (err) {
    console.error("Checkout-order error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
