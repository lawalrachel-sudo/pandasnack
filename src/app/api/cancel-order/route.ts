import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase: any = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

    const { orderId } = await req.json()
    if (!orderId) return NextResponse.json({ error: "orderId manquant" }, { status: 400 })

    const { data: account } = await (supabase as any)
      .from("accounts").select("id").eq("auth_user_id", user.id).single()
    if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })

    const { data: order } = await (supabase as any)
      .from("orders")
      .select("id, account_id, status, total_cents, payment_method, wallet_transaction_id, service_slot_id")
      .eq("id", orderId)
      .eq("account_id", account.id)
      .single()

    if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 })
    if (order.status === "cancelled") return NextResponse.json({ error: "Déjà annulée" }, { status: 400 })
    if (order.status !== "paid" && order.status !== "pending_payment") {
      return NextResponse.json({ error: "Commande non annulable" }, { status: 400 })
    }

    // Vérifier heure limite via orders_cutoff_at du slot (source unique de vérité)
    if (order.service_slot_id) {
      const { data: slot } = await supabase
        .from("service_slots").select("orders_cutoff_at").eq("id", order.service_slot_id).single()

      if (slot?.orders_cutoff_at) {
        const cutoff = new Date(slot.orders_cutoff_at)
        if (new Date() >= cutoff) {
          return NextResponse.json({
            error: "L'heure limite est passée — la commande est ferme et ne peut plus être annulée."
          }, { status: 400 })
        }
      }
    }

    // Annuler la commande
    await (supabase as any).from("orders").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    }).eq("id", orderId)

    // Recrédit wallet si payé par wallet
    if (order.status === "paid" && order.total_cents > 0) {
      const { data: wallet } = await (supabase as any)
        .from("wallets").select("id, balance_cents").eq("account_id", account.id).single()

      if (wallet) {
        const newBalance = wallet.balance_cents + order.total_cents

        await (supabase as any).from("wallet_transactions").insert({
          wallet_id: wallet.id,
          type: "refund",
          amount_cents: order.total_cents,
          balance_after_cents: newBalance,
          description: "Remboursement commande annulée",
        })

        // Récupérer total_credited_cents actuel pour incrémentation
        const { data: w2 } = await (supabase as any)
          .from("wallets").select("total_credited_cents").eq("id", wallet.id).single()

        await (supabase as any).from("wallets").update({
          balance_cents: newBalance,
          total_credited_cents: (w2?.total_credited_cents || 0) + order.total_cents,
          updated_at: new Date().toISOString(),
        }).eq("id", wallet.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Cancel order error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
