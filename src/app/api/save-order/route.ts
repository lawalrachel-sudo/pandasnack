import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"

// POST /api/save-order
// Saves cart as a draft order (status: pending_payment, payment_method: draft)
export async function POST(req: NextRequest) {
  try {
    const supabase: any = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
    }

    const body = await req.json()
    const { slotId, items, specialRequest } = body as {
      slotId: string
      items: SaveItem[]
      specialRequest?: string
    }

    if (!slotId || !items?.length) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 })
    }

    const { data: account, error: accErr } = await supabase
      .from("accounts")
      .select("id")
      .eq("auth_user_id", user.id)
      .single()
    if (accErr || !account) {
      return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })
    }

    // Vérifier heure limite de commande
    const { data: slot } = await supabase
      .from("service_slots")
      .select("id, orders_cutoff_at")
      .eq("id", slotId)
      .single()

    if (slot?.orders_cutoff_at) {
      const cutoff = new Date(slot.orders_cutoff_at)
      if (new Date() >= cutoff) {
        return NextResponse.json({
          error: "L'heure limite de commande pour ce jour est passée (veille 20h). Cette commande n'est plus disponible."
        }, { status: 400 })
      }
    }

    const subtotalCents = items.reduce((sum, i) => sum + i.priceCents * (i.quantity || 1), 0)
    const vatRate = 2.10
    const vatCents = Math.round(subtotalCents * vatRate / 100)
    const totalCents = subtotalCents + vatCents

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        account_id: account.id,
        service_slot_id: slotId,
        status: "pending_payment",
        subtotal_cents: subtotalCents,
        vat_rate: vatRate,
        vat_cents: vatCents,
        total_cents: totalCents,
        payment_method: "draft",
        special_request: specialRequest || null,
      })
      .select("id, order_number")
      .single()

    if (orderErr || !order) {
      console.error("Save order error:", orderErr)
      return NextResponse.json({ error: "Erreur sauvegarde commande" }, { status: 500 })
    }

    const orderItems = items.map((item) => ({
      order_id: order.id,
      catalog_item_id: item.isFormula ? null : item.itemId,
      menu_formula_id: item.isFormula ? item.itemId : null,
      formula_choices: item.isFormula ? {
        plat_sku: item.selectedPlat,
        toppings: item.selectedToppings,
      } : null,
      topping_ids: item.selectedToppings?.length ? item.selectedToppings : null,
      quantity: item.quantity || 1,
      unit_price_cents: item.priceCents,
      line_total_cents: item.priceCents * (item.quantity || 1),
      profil_id: item.profilId || null,
      prenom_libre: item.profilPrenom || null,
      takeaway: item.isTakeaway || false,
      notes: item.itemName,
    }))

    const { error: itemsErr } = await supabase.from("order_items").insert(orderItems)
    if (itemsErr) {
      console.error("Save order items error:", itemsErr)
      await supabase.from("orders").delete().eq("id", order.id)
      return NextResponse.json({ error: "Erreur ajout articles" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
    })

  } catch (err) {
    console.error("Save order error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}

interface SaveItem {
  itemId: string
  itemName: string
  priceCents: number
  quantity?: number
  profilId: string | null
  profilPrenom: string
  isTakeaway: boolean
  isFormula: boolean
  formulaCode: string | null
  selectedPlat: string | null
  selectedToppings: string[]
}
