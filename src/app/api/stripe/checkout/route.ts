import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { createServerSupabase } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const stripe = getStripe()
    if (!stripe) {
      return NextResponse.json({ error: "Stripe non configuré" }, { status: 503 })
    }

    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
    }

    const { amount_cents, family_id } = await request.json()

    if (!amount_cents || amount_cents < 1000) {
      return NextResponse.json({ error: "Montant minimum 10 €" }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: amount_cents,
            product_data: {
              name: "Recharge Pass Panda",
              description: `Recharge wallet Panda Snack — ${(amount_cents / 100).toFixed(2)} €`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        product_line: "panda_snack",
        family_id,
        type: "wallet_recharge",
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/mon-espace?recharge=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/mon-espace?recharge=cancelled`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("Stripe checkout error:", error)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
