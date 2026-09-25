import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

// POST /api/cancel-order — annulation d'une commande par son propriétaire.
//
// PS-05c — l'ancienne version écrivait l'UPDATE avec le client utilisateur (soumis à la
// RLS) SANS lire { error }, et répondait success quel que soit le résultat : sur une
// commande déjà payée la ligne n'était jamais modifiée et le parent croyait avoir annulé
// (audit PS-05 §A-10). Désormais :
//   - l'autorisation (propriété + statut + cutoff) est vérifiée avec le client utilisateur,
//   - l'écriture passe en service_role, comme /api/admin/mark-paid,
//   - l'erreur ET le nombre de lignes touchées sont contrôlés.
export async function POST(req: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

    const { orderId } = await req.json().catch(() => ({})) as { orderId?: string }
    if (!orderId) return NextResponse.json({ error: "orderId manquant" }, { status: 400 })

    const { data: account } = await supabase
      .from("accounts").select("id").eq("auth_user_id", user.id).single()
    if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })

    const { data: order } = await supabase
      .from("orders")
      .select("id, account_id, status, total_cents, payment_method, wallet_transaction_id, service_slot_id")
      .eq("id", orderId)
      .eq("account_id", account.id)
      .maybeSingle()

    if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 })
    if (order.status === "cancelled") return NextResponse.json({ error: "Déjà annulée" }, { status: 400 })
    if (order.status !== "paid" && order.status !== "pending_payment") {
      return NextResponse.json({ error: "Commande non annulable" }, { status: 400 })
    }

    // POINT 5 — cutoff ne s'applique QUE si la commande est payée (ferme).
    // Si pending_payment (jamais payée), on autorise la suppression même périmée
    // (sinon une commande "fantôme" reste coincée pour toujours dans le panier).
    if (order.status === "paid" && order.service_slot_id) {
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

    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

    // Annuler la commande. `account_id` est reposé sur l'UPDATE : le service_role
    // contourne la RLS, la garde de propriété doit donc être explicite ici aussi.
    // `.in(status)` rend l'opération idempotente (un double clic ne réécrit rien).
    const { data: cancelled, error: cancelErr } = await admin
      .from("orders")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("account_id", account.id)
      .in("status", ["paid", "pending_payment"])
      .select("id, status, cancelled_at")

    if (cancelErr) {
      console.error("[cancel-order] update:", cancelErr)
      return NextResponse.json({ error: "L'annulation a échoué. Réessaie." }, { status: 500 })
    }
    if (!cancelled || cancelled.length === 0) {
      return NextResponse.json({ error: "Commande non annulable" }, { status: 409 })
    }

    // Recrédit wallet si payé par wallet/carte. §7 — JAMAIS pour 'on_site' : l'argent a été
    // encaissé en espèces/CB au comptoir, il n'est jamais entré dans le wallet (sinon on
    // créditerait un remboursement fantôme).
    if (order.status === "paid" && order.total_cents > 0 && order.payment_method !== "on_site") {
      const { data: wallet, error: walletErr } = await admin
        .from("wallets").select("id, balance_cents, total_credited_cents")
        .eq("account_id", account.id).maybeSingle()
      if (walletErr) console.error("[cancel-order] wallet read:", walletErr)

      if (wallet) {
        const newBalance = wallet.balance_cents + order.total_cents

        const { error: txErr } = await admin.from("wallet_transactions").insert({
          wallet_id: wallet.id,
          type: "refund",
          amount_cents: order.total_cents,
          balance_after_cents: newBalance,
          description: "Remboursement commande annulée",
        })
        if (txErr) console.error("[cancel-order] wallet tx:", txErr)

        const { error: wUpdErr } = await admin.from("wallets").update({
          balance_cents: newBalance,
          total_credited_cents: (wallet.total_credited_cents || 0) + order.total_cents,
          updated_at: new Date().toISOString(),
        }).eq("id", wallet.id)
        if (wUpdErr) console.error("[cancel-order] wallet update:", wUpdErr)

        // La commande est bien annulée : on ne renvoie pas 500, mais on signale au parent
        // que le recrédit doit être vérifié plutôt que de le laisser croire qu'il est fait.
        if (txErr || wUpdErr) {
          return NextResponse.json({
            success: true,
            refunded: false,
            warning: "Commande annulée. Le recrédit du wallet n'a pas abouti — contacte-nous.",
          })
        }
        return NextResponse.json({ success: true, refunded: true })
      }
    }

    return NextResponse.json({ success: true, refunded: false })
  } catch (err) {
    console.error("Cancel order error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
