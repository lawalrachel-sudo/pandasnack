import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"

// POST /api/checkout-onsite — §7 : confirmation "Payer sur place (CB/espèces)"
// Réservé aux comptes pandattitude. La commande part en cuisine SANS paiement en ligne :
//   payment_method = 'on_site', status reste 'pending_payment', paid_at = NULL.
// PAS d'appel Stripe, PAS de débit wallet, PAS de changement de schéma/enum.
// Les montants sont déjà renseignés par le recalc de /api/order-item à chaque ajout.
// Body: { orderIds: string[] }
export async function POST(req: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

    const { orderIds } = await req.json() as { orderIds: string[] }
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: "Aucune commande sélectionnée" }, { status: 400 })
    }

    // Compte + garde métier : l'option sur place est exclusive à pandattitude.
    const { data: account } = await supabase
      .from("accounts").select("id, source_group").eq("auth_user_id", user.id).single()
    if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })
    if (account.source_group !== "pandattitude") {
      return NextResponse.json({ error: "Paiement sur place non disponible" }, { status: 403 })
    }

    // Confirme uniquement les commandes du compte encore en attente. RLS limite déjà au
    // propriétaire ; le filtre account_id + status verrouille en plus (idempotent : un renvoi
    // ne touche pas une commande déjà payée/annulée).
    const { data: updated, error: updErr } = await supabase
      .from("orders")
      .update({ payment_method: "on_site" })
      .in("id", orderIds)
      .eq("account_id", account.id)
      .eq("status", "pending_payment")
      .select("id")
    if (updErr) {
      console.error("Checkout-onsite update error:", updErr)
      return NextResponse.json({ error: "Erreur confirmation" }, { status: 500 })
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "Aucune commande à confirmer" }, { status: 400 })
    }

    // Retour au panier : /confirmation suppose un paiement en ligne (et son chaînage
    // "payer les N autres" serait trompeur ici). Le panier affiche désormais ces commandes
    // comme "Confirmée · à régler sur place" + bannière de succès.
    return NextResponse.json({
      success: true,
      confirmedCount: updated.length,
      redirect: `/panier?onsite=ok`,
    })
  } catch (err) {
    console.error("Checkout-onsite error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
