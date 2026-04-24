import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"
import { getStripe } from "@/lib/stripe"

// POST /api/recharger — create Stripe Checkout session for wallet recharge
export async function POST(req: NextRequest) {
  try {
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
    const { amountCents, bonusCents = 0 } = body as { amountCents: number; bonusCents: number }

    if (!amountCents || amountCents < 500 || amountCents > 20000) {
      return NextResponse.json({ error: "Montant invalide (5-200€)" }, { status: 400 })
    }

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
    const origin = req.headers.get("origin") || "https://pandasnack-five.vercel.app"

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
