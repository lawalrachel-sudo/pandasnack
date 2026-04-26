import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"

// DELETE /api/order-item?itemId=xxx
export async function DELETE(req: NextRequest) {
  try {
    const supabase: any = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 })
    }

    const itemId = req.nextUrl.searchParams.get("itemId")
    if (!itemId) {
      return NextResponse.json({ error: "itemId manquant" }, { status: 400 })
    }

    const { data: item, error: itemErr } = await supabase
      .from("order_items")
      .select("id, order_id, line_total_cents")
      .eq("id", itemId)
      .single()
    if (itemErr || !item) {
      return NextResponse.json({ error: "Article introuvable" }, { status: 404 })
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, account_id, status, total_cents, subtotal_cents, vat_cents, vat_rate, service_slot_id, payment_method")
      .eq("id", item.order_id)
      .single()
    if (orderErr || !order) {
      return NextResponse.json({ error: "Commande introuvable" }, { status: 404 })
    }

    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("auth_user_id", user.id)
      .single()
    if (!account || account.id !== order.account_id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 403 })
    }

    // Vérifier heure limite via orders_cutoff_at du slot
    if (order.service_slot_id) {
      const { data: slot } = await supabase
        .from("service_slots")
        .select("orders_cutoff_at")
        .eq("id", order.service_slot_id)
        .single()

      if (slot?.orders_cutoff_at) {
        const cutoff = new Date(slot.orders_cutoff_at)
        if (new Date() >= cutoff) {
          return NextResponse.json({
            error: "L'heure limite est passée, modification impossible."
          }, { status: 400 })
        }
      }
    }

    // Compter les items restants
    const { count } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id)

    if ((count ?? 0) <= 1) {
      // Dernier item → annuler la commande entière
      await supabase.from("order_items").delete().eq("id", itemId)
      await supabase.from("orders").update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        total_cents: 0,
        subtotal_cents: 0,
        vat_cents: 0,
      }).eq("id", order.id)

      // Recrédit wallet si la commande était payée par wallet (BUG 10 FIX)
      if (order.status === "paid" && order.total_cents > 0) {
        await walletRefund(supabase, account.id, order.total_cents, "Remboursement commande annulée (dernier article supprimé)")
      }

      return NextResponse.json({ success: true, orderCancelled: true })
    }

    // Supprimer l'item
    await supabase.from("order_items").delete().eq("id", itemId)

    // Recalculer le total
    const { data: remaining } = await supabase
      .from("order_items")
      .select("line_total_cents")
      .eq("order_id", order.id)

    const newSubtotal = (remaining || []).reduce((s: number, r: { line_total_cents: number }) => s + r.line_total_cents, 0)
    const vatRate = Number(order.vat_rate) || 2.10
    const newVat = Math.round(newSubtotal * vatRate / 100)
    const newTotal = newSubtotal + newVat
    const diffCents = order.total_cents - newTotal

    await supabase.from("orders").update({
      subtotal_cents: newSubtotal,
      vat_cents: newVat,
      total_cents: newTotal,
    }).eq("id", order.id)

    // Recrédit wallet de la différence si payé par wallet (BUG 10 FIX)
    if (order.status === "paid" && diffCents > 0) {
      await walletRefund(supabase, account.id, diffCents, "Recrédit article supprimé")
    }

    return NextResponse.json({ success: true, newTotal })

  } catch (err) {
    console.error("Delete order item error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}

// Fonction utilitaire : recrédit wallet
async function walletRefund(supabase: any, accountId: string, amountCents: number, description: string) {
  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, balance_cents, total_credited_cents")
    .eq("account_id", accountId)
    .single()

  if (wallet) {
    const newBalance = wallet.balance_cents + amountCents

    await supabase.from("wallet_transactions").insert({
      wallet_id: wallet.id,
      type: "refund",
      amount_cents: amountCents,
      balance_after_cents: newBalance,
      description,
    })

    await supabase.from("wallets").update({
      balance_cents: newBalance,
      total_credited_cents: (wallet.total_credited_cents || 0) + amountCents,
      updated_at: new Date().toISOString(),
    }).eq("id", wallet.id)
  }
}
