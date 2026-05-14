import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"
import { getStripe } from "@/lib/stripe"
import { resolveOrigin } from "@/lib/origin"

// POST /api/recharger — create Stripe Checkout session for wallet recharge
export async function POST(req: NextRequest) {
  try {
    // P0 #1 — En production, refuser si pas de clé Stripe (au lieu de tomber dans le mode TEST
    // qui crédite le wallet sans paiement réel). Le mode TEST reste OK pour dev/staging local.
    if (process.env.NODE_ENV === "production" && !process.env.STRIPE_SECRET_KEY) {
      console.error("[recharger] STRIPE_SECRET_KEY manquante en production — recharge refusée")
      return NextResponse.json({ error: "Service de paiement non configuré" }, { status: 503 })
    }

    const supabase: any = await createClient()
    const stripe = getStripe()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
    }

    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("auth_user_id", user.id)
      .single()
    if (!account) {
      return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })
    }

    const body = await req.json()
    const { amountCents } = body as { amountCents: number }

    if (!amountCents || amountCents < 500 || amountCents > 20000) {
      return NextResponse.json({ error: "Montant invalide (5-200€)" }, { status: 400 })
    }

    // P0 #2 — bonusCents NE VIENT PLUS du body client. Lookup server-side dans
    // wallet_recharge_config : seul un palier configuré (active=true) attribue un bonus.
    // Recharge custom (montant hors paliers) → bonusCents = 0. Évite l'exploit où un user
    // envoyait {amountCents:500, bonusCents:9999900} pour s'auto-créditer.
    const { data: cfg } = await supabase
      .from("wallet_recharge_config")
      .select("bonus_cents")
      .eq("recharge_cents", amountCents)
      .eq("active", true)
      .maybeSingle()
    const bonusCents: number = cfg?.bonus_cents ?? 0

    if (!stripe) {
      // Stripe not configured — simulate for test mode
      // In test mode without real key, just credit wallet directly
      let { data: wallet } = await supabase
        .from("wallets")
        .select("id, balance_cents")
        .eq("account_id", account.id)
        .single()

      if (!wallet) {
        const { data: newWallet } = await supabase
          .from("wallets")
          .insert({
            account_id: account.id,
            balance_cents: 0,
            expires_at: "2026-12-31T23:59:59Z",
          })
          .select()
          .single()
        wallet = newWallet
      }

      if (wallet) {
        const creditTotal = amountCents + bonusCents
        await supabase
          .from("wallets")
          .update({ balance_cents: wallet.balance_cents + creditTotal })
          .eq("id", wallet.id)

        await supabase
          .from("wallet_transactions")
          .insert({
            wallet_id: wallet.id,
            type: "credit_purchase",
            amount_cents: creditTotal,
            balance_after_cents: wallet.balance_cents + creditTotal,
            description: `Recharge ${(amountCents / 100).toFixed(2)} €${bonusCents > 0 ? ` + bonus ${(bonusCents / 100).toFixed(2)} €` : ""}`,
          })
      }

      // Redirect to mon-espace wallet tab
      return NextResponse.json({ url: "/mon-espace?tab=wallet" })
    }

    // Create Stripe Checkout session
    // P0 #4 — origin whitelist (cf src/lib/origin.ts), pas de Host header spoofable
    const origin = resolveOrigin(req.headers.get("origin"))

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "Recharge Panda Wallet",
              description: bonusCents > 0
                ? `${(amountCents / 100).toFixed(2)} € + ${(bonusCents / 100).toFixed(2)} € offerts`
                : `${(amountCents / 100).toFixed(2)} €`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        product_line: "panda_snack",
        type: "wallet_recharge",
        account_id: account.id,
        bonus_cents: String(bonusCents),
      },
      success_url: `${origin}/mon-espace?tab=wallet&recharge=success`,
      cancel_url: `${origin}/recharger?cancelled=1`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error("Recharger error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
