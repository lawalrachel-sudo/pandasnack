import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"

// DELETE /api/order-item?itemId=xxx
// Supprime une ligne de commande. Si c'est la dernière, annule la commande.
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

    // Recuperer l'item et sa commande
    const { data: item, error: itemErr } = await supabase
      .from("order_items")
      .select("id, order_id, line_total_cents")
      .eq("id", itemId)
      .single()
    if (itemErr || !item) {
      return NextResponse.json({ error: "Article introuvable" }, { status: 404 })
    }

    // Verifier que la commande appartient au user
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, account_id, status, total_cents, subtotal_cents, vat_cents, vat_rate, service_slot_id")
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

    // Verifier cutoff
    const { data: slot } = await supabase
      .from("service_slots")
      .select("service_date")
      .eq("id", order.service_slot_id)
      .single()
    if (slot) {
      const cutoff = new Date(slot.service_date + "T00:00:00Z")
      cutoff.setTime(cutoff.getTime() - 4 * 3600000)
      if (new Date() >= cutoff) {
        return NextResponse.json({ error: "Cutoff depasse, modification impossible" }, { status: 400 })
      }
    }

    // Verifier si c'est le dernier item
    const { count } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id)

    if (count <= 1) {
      // Dernier item -> annuler la commande
      await supabase.from("order_items").delete().eq("id", itemId)
      await supabase.from("orders").update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        total_cents: 0,
        subtotal_cents: 0,
        vat_cents: 0,
      }).eq("id", order.id)
      return NextResponse.json({ success: true, orderCancelled: true })
    }

    // Supprimer l'item
    await supabase.from("order_items").delete().eq("id", itemId)

    // Recalculer le total
    const { data: remaining } = await supabase
      .from("order_items")
      .select("line_total_cents")
      .eq("order_id", order.id)

    const newSubtotal = (remaining || []).reduce((s: number, r: any) => s + r.line_total_cents, 0)
    const vatRate = Number(order.vat_rate) || 2.10
    const newVat = Math.round(newSubtotal * vatRate / 100)
    const newTotal = newSubtotal + newVat

    await supabase.from("orders").update({
      subtotal_cents: newSubtotal,
      vat_cents: newVat,
      total_cents: newTotal,
    }).eq("id", order.id)

    return NextResponse.json({ success: true, newTotal })

  } catch (err) {
    console.error("Delete order item error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
