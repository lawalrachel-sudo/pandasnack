import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"

// PATCH /api/order-item — swap plat (item solo OU plat dans formula) + toppings
// Body: { orderItemId, newSku, selectedToppings? }
// - Solo : update catalog_item_id, unit_price_cents (du nouveau plat), line_total_cents, notes
// - Formula+plat (Brief 3-E B-α-ter) : update catalog_item_id + formula_choices.plat_sku + topping_ids, prix formula INCHANGÉ
// - Validation : same-category prefix (SAND/CROQ/PASTA/SAL) MVP
export async function PATCH(req: NextRequest) {
  try {
    const supabase: any = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

    const { orderItemId, newSku, selectedToppings } = await req.json() as {
      orderItemId: string
      newSku: string
      selectedToppings?: string[]
    }
    if (!orderItemId || !newSku) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 })
    }

    // Get the order_item
    const { data: item } = await supabase.from("order_items")
      .select("id, order_id, catalog_item_id, menu_formula_id, formula_choices, unit_price_cents")
      .eq("id", orderItemId).single()
    if (!item) return NextResponse.json({ error: "Article introuvable" }, { status: 404 })

    const isFormulaPlat = !!item.menu_formula_id  // formula avec ou sans plat
    const isSolo = !!item.catalog_item_id && !item.menu_formula_id

    if (!isFormulaPlat && !isSolo) {
      return NextResponse.json({ error: "Article inéligible à la modification" }, { status: 400 })
    }

    // Get order + ownership + cutoff
    const { data: order } = await supabase.from("orders")
      .select("id, account_id, status, vat_rate, service_slot_id")
      .eq("id", item.order_id).single()
    if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 })

    const { data: account } = await supabase.from("accounts")
      .select("id").eq("auth_user_id", user.id).single()
    if (!account || account.id !== order.account_id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 })
    }

    if (order.status !== "pending_payment") {
      return NextResponse.json({ error: "Commande non modifiable" }, { status: 400 })
    }

    if (order.service_slot_id) {
      const { data: slot } = await supabase.from("service_slots")
        .select("orders_cutoff_at").eq("id", order.service_slot_id).single()
      if (slot?.orders_cutoff_at && new Date() >= new Date(slot.orders_cutoff_at)) {
        return NextResponse.json({ error: "Heure limite dépassée — modification impossible" }, { status: 400 })
      }
    }

    // Original item to compare category
    let origPrefix = ""
    if (item.catalog_item_id) {
      const { data: originalItem } = await supabase.from("catalog_items")
        .select("sku").eq("id", item.catalog_item_id).single()
      origPrefix = (originalItem?.sku || "").split("-")[0]
    } else if (item.formula_choices?.plat_sku) {
      origPrefix = String(item.formula_choices.plat_sku).split("-")[0]
    }

    // New item validation : selon le mode, sellable_alone ou sellable_in_menu
    const { data: newItem } = await supabase.from("catalog_items")
      .select("id, name, sku, price_alone_cents, sellable_alone, sellable_in_menu, active")
      .eq("sku", newSku).single()
    if (!newItem || !newItem.active) {
      return NextResponse.json({ error: "Article cible invalide" }, { status: 400 })
    }
    if (isSolo && (!newItem.sellable_alone || newItem.price_alone_cents == null)) {
      return NextResponse.json({ error: "Article cible non vendable seul" }, { status: 400 })
    }
    if (isFormulaPlat && !newItem.sellable_in_menu) {
      return NextResponse.json({ error: "Article cible non disponible dans le menu" }, { status: 400 })
    }
    const newPrefix = (newItem.sku || "").split("-")[0]
    if (origPrefix && newPrefix && origPrefix !== newPrefix) {
      return NextResponse.json({ error: "Catégorie incompatible" }, { status: 400 })
    }

    if (isSolo) {
      // Mode solo : update catalog_item_id + prix
      await supabase.from("order_items").update({
        catalog_item_id: newItem.id,
        unit_price_cents: newItem.price_alone_cents,
        line_total_cents: newItem.price_alone_cents,
        notes: newItem.name,
      }).eq("id", orderItemId)

      // Recalc order totals (prix change pour solo)
      const { data: items } = await supabase.from("order_items")
        .select("line_total_cents").eq("order_id", order.id)
      const newSubtotal = (items || []).reduce((s: number, r: { line_total_cents: number }) => s + r.line_total_cents, 0)
      const vatRate = Number(order.vat_rate) || 2.10
      const newVat = Math.round(newSubtotal * vatRate / 100)
      const newTotal = newSubtotal + newVat

      await supabase.from("orders").update({
        subtotal_cents: newSubtotal,
        vat_cents: newVat,
        total_cents: newTotal,
      }).eq("id", order.id)

      return NextResponse.json({ success: true, newTotal })
    }

    // Mode formula+plat : update catalog_item_id (vrai plat) + formula_choices.plat_sku + topping_ids
    // Prix formula INCHANGÉ → pas de recalc totals
    const newToppings = selectedToppings && selectedToppings.length > 0 ? selectedToppings : null
    const newFormulaChoices = {
      ...(item.formula_choices && typeof item.formula_choices === "object" ? item.formula_choices : {}),
      plat_sku: newItem.sku,
      toppings: selectedToppings || [],
    }

    await supabase.from("order_items").update({
      catalog_item_id: newItem.id,
      formula_choices: newFormulaChoices,
      topping_ids: newToppings,
    }).eq("id", orderItemId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Swap order item error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}

// POST /api/order-item — auto-persist d'un item dans une order pending
// Mode A (existant) : { orderId, catalogItemId|menuFormulaId, ... } → ajoute à l'order spécifique
// Mode B (Brief 3-E B-α) : { slotId, catalogItemId|menuFormulaId, selectedPlatSku?, ... } → find-or-create order pending pour le slot
export async function POST(req: NextRequest) {
  try {
    const supabase: any = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
    }

    const body = await req.json()
    const {
      orderId, slotId,
      catalogItemId, menuFormulaId, selectedPlatSku,
      profilId, prenomLibre, takeaway, notes, selectedToppings,
    } = body as {
      orderId?: string
      slotId?: string
      catalogItemId?: string | null
      menuFormulaId?: string | null
      selectedPlatSku?: string | null
      profilId?: string | null
      prenomLibre?: string | null
      takeaway?: boolean
      notes: string
      selectedToppings?: string[]
    }

    if (!notes || (!catalogItemId && !menuFormulaId)) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 })
    }
    if (!orderId && !slotId) {
      return NextResponse.json({ error: "orderId ou slotId requis" }, { status: 400 })
    }

    const { data: account } = await supabase
      .from("accounts").select("id").eq("auth_user_id", user.id).single()
    if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })

    // Find or create order
    let order: { id: string; account_id: string; status: string; vat_rate: number; service_slot_id: string | null } | null = null
    let orderJustCreated = false  // pour cleanup orphan en cas d'échec INSERT order_items

    if (orderId) {
      // Mode A : order spécifié
      const { data } = await supabase.from("orders")
        .select("id, account_id, status, vat_rate, service_slot_id")
        .eq("id", orderId).single()
      order = data
      if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 })
      if (order.account_id !== account.id) return NextResponse.json({ error: "Non autorisé" }, { status: 403 })
    } else if (slotId) {
      // Mode B : find-or-create pending order pour ce slot
      const { data: existing } = await supabase.from("orders")
        .select("id, account_id, status, vat_rate, service_slot_id")
        .eq("account_id", account.id)
        .eq("service_slot_id", slotId)
        .eq("status", "pending_payment")
        .maybeSingle()
      if (existing) {
        order = existing
      } else {
        // Créer une nouvelle order pending
        const { data: created, error: createErr } = await supabase.from("orders").insert({
          account_id: account.id,
          service_slot_id: slotId,
          status: "pending_payment",
          subtotal_cents: 0,
          vat_rate: 2.10,
          vat_cents: 0,
          total_cents: 0,
          payment_method: "draft",
        }).select("id, account_id, status, vat_rate, service_slot_id").single()
        if (createErr || !created) {
          console.error("Create order error:", createErr)
          return NextResponse.json({ error: "Erreur création commande" }, { status: 500 })
        }
        order = created
        orderJustCreated = true
      }
    }

    if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 })

    if (order.status !== "pending_payment") {
      return NextResponse.json({ error: "Cette commande n'est plus modifiable" }, { status: 400 })
    }

    if (order.service_slot_id) {
      const { data: slot } = await supabase
        .from("service_slots").select("orders_cutoff_at").eq("id", order.service_slot_id).single()
      if (slot?.orders_cutoff_at && new Date() >= new Date(slot.orders_cutoff_at)) {
        return NextResponse.json({ error: "L'heure limite est passée, ajout impossible." }, { status: 400 })
      }
    }

    // Determine price from catalog or formula
    let unitPriceCents = 0
    if (catalogItemId) {
      const { data: catalogItem } = await supabase
        .from("catalog_items").select("price_alone_cents, sellable_alone, active").eq("id", catalogItemId).single()
      if (!catalogItem || !catalogItem.active || !catalogItem.sellable_alone || catalogItem.price_alone_cents == null) {
        return NextResponse.json({ error: "Article indisponible" }, { status: 400 })
      }
      unitPriceCents = catalogItem.price_alone_cents
    } else if (menuFormulaId) {
      const { data: formula } = await supabase
        .from("menu_formulas").select("price_cents, active").eq("id", menuFormulaId).single()
      if (!formula || !formula.active) {
        return NextResponse.json({ error: "Formule indisponible" }, { status: 400 })
      }
      unitPriceCents = formula.price_cents
    }

    // Phase 1 (Brief 3-E) — lookup catalog_item_id du vrai plat si formula+plat
    let resolvedCatalogItemId: string | null = catalogItemId || null
    if (menuFormulaId && selectedPlatSku) {
      const { data: plat } = await supabase
        .from("catalog_items").select("id").eq("sku", selectedPlatSku).single()
      if (plat) resolvedCatalogItemId = plat.id
    }

    const lineTotal = unitPriceCents

    const { error: insertErr } = await supabase.from("order_items").insert({
      order_id: order.id,
      catalog_item_id: resolvedCatalogItemId,
      menu_formula_id: menuFormulaId || null,
      formula_choices: menuFormulaId ? { plat_sku: selectedPlatSku || null, toppings: selectedToppings || [] } : null,
      topping_ids: selectedToppings?.length ? selectedToppings : null,
      quantity: 1,
      unit_price_cents: unitPriceCents,
      line_total_cents: lineTotal,
      profil_id: profilId || null,
      prenom_libre: prenomLibre || null,
      takeaway: takeaway || false,
      notes,
    })

    if (insertErr) {
      console.error("Add order item error:", insertErr)
      // Cleanup orphan : si on vient juste de créer l'order et que l'INSERT items fail, supprimer l'order vide
      if (orderJustCreated) {
        await supabase.from("orders").delete().eq("id", order.id)
      }
      return NextResponse.json({ error: "Erreur ajout article" }, { status: 500 })
    }

    // Recalc totals
    const { data: items } = await supabase
      .from("order_items").select("line_total_cents").eq("order_id", order.id)
    const newSubtotal = (items || []).reduce((s: number, r: { line_total_cents: number }) => s + r.line_total_cents, 0)
    const vatRate = Number(order.vat_rate) || 2.10
    const newVat = Math.round(newSubtotal * vatRate / 100)
    const newTotal = newSubtotal + newVat

    await supabase.from("orders").update({
      subtotal_cents: newSubtotal,
      vat_cents: newVat,
      total_cents: newTotal,
    }).eq("id", order.id)

    return NextResponse.json({ success: true, orderId: order.id, newTotal })
  } catch (err) {
    console.error("Add order item error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}

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
