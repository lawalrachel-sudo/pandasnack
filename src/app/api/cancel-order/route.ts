import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

    const { orderId } = await req.json()
    if (!orderId) return NextResponse.json({ error: "orderId manquant" }, { status: 400 })

    // Récupérer le compte
    const { data: account } = await supabase
      .from("accounts").select("id").eq("auth_user_id", user.id).single()
    if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })

    // Récupérer la commande + vérifier propriétaire
    const { data: order } = await supabase
      .from("orders")
      .select("id, account_id, status, total_cents, payment_method, wallet_transaction_id, service_slots!inner(service_date)")
      .eq("id", orderId)
      .eq("account_id", account.id)
      .single()

    if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 })
    if (order.status === "cancelled") return NextResponse.json({ error: "Déjà annulée" }, { status: 400 })
    if (order.status !== "paid" && order.status !== "pending_payment") {
      return NextResponse.json({ error: "Commande non annulable" }, { status: 400 })
    }

    // Vérifier cutoff (veille 20h Martinique = UTC-4)
    const serviceDate = (order.service_slots as any)?.service_date
    if (serviceDate) {
      const cutoff = new Date(serviceDate + "T00:00:00Z") // UTC midnight du jour de service
      cutoff.setUTCHours(0, 0, 0, 0) // début du jour UTC
      cutoff.setUTCDate(cutoff.getUTCDate() - 1) // veille
      cutoff.setUTCHours(24, 0, 0, 0) // 20h Martinique (UTC-4) = 00h UTC J
      
      if (new Date() >= cutoff) {
        return NextResponse.json({ error: "Cutoff dépassé — commande ferme" }, { status: 400 })
      }
    }

    // Annuler la commande
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId)

    // Recrédit wallet si payé par wallet
    if (order.status === "paid" && order.total_cents > 0) {
      const { data: wallet } = await supabase
        .from("wallets").select("id, balance_cents").eq("account_id", account.id).single()

      if (wallet) {
        const newBalance = wallet.balance_cents + order.total_cents

        // Créer transaction de recrédit
        await supabase.from("wallet_transactions").insert({
          wallet_id: wallet.id,
          type: "refund",
          amount_cents: order.total_cents,
          balance_after_cents: newBalance,
          description: `Remboursement commande annulée`,
        })

        // Mettre à jour le solde
        await supabase.from("wallets").update({
          balance_cents: newBalance,
          total_credited_cents: wallet.balance_cents + order.total_cents, // approximation
        }).eq("id", wallet.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Cancel order error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
