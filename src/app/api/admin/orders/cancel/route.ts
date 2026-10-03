import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// POST /api/admin/orders/cancel  body: { orderId }
// PS-14b — annulation admin UNIFIÉE depuis le Service du jour, un seul flux de remboursement :
//   • commande Sa ki ni → RPC sa_ki_ni_reverse (recrédit wallet + portion rendue, transactionnel) ;
//   • commande normale payée (hors sur place) → recrédit wallet, comme /api/cancel-order.
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const body = await req.json().catch(() => null)
  const orderId: string | undefined = body?.orderId
  if (!orderId) return NextResponse.json({ error: "orderId requis" }, { status: 400 })

  const { data: order } = await admin.from("orders")
    .select("id, status, sa_ki_ni, total_cents, payment_method, account_id, order_number")
    .eq("id", orderId).maybeSingle()
  if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 })
  if (order.status === "cancelled") return NextResponse.json({ ok: true, already: true })
  if (order.status !== "paid" && order.status !== "pending_payment") {
    return NextResponse.json({ error: "Commande non annulable" }, { status: 400 })
  }

  // Sa ki ni → RPC transactionnelle (recrédit + portion rendue).
  if (order.sa_ki_ni) {
    const { data, error } = await admin.rpc("sa_ki_ni_reverse", { p_order_id: orderId })
    if (error) {
      console.error("[admin/orders/cancel] reverse", error.message)
      return NextResponse.json({ error: "Annulation impossible" }, { status: 400 })
    }
    const row = Array.isArray(data) ? data[0] : data
    return NextResponse.json({ ok: true, saKiNi: true, refundedCents: row?.refunded_cents ?? 0, portionsReturned: row?.portions_returned ?? 0 })
  }

  // Commande normale : marque annulée, puis recrédit wallet si payée (jamais pour 'on_site').
  const { data: cancelled, error: cancelErr } = await admin.from("orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", orderId).in("status", ["paid", "pending_payment"]).select("id")
  if (cancelErr) { console.error("[admin/orders/cancel]", cancelErr); return NextResponse.json({ error: "L'annulation a échoué" }, { status: 500 }) }
  if (!cancelled || cancelled.length === 0) return NextResponse.json({ error: "Commande non annulable" }, { status: 409 })

  let refunded = false
  if (order.status === "paid" && order.total_cents > 0 && order.payment_method !== "on_site") {
    const { data: wallet } = await admin.from("wallets").select("id, balance_cents, total_credited_cents").eq("account_id", order.account_id).maybeSingle()
    if (wallet) {
      const newBalance = wallet.balance_cents + order.total_cents
      const { error: txErr } = await admin.from("wallet_transactions").insert({
        wallet_id: wallet.id, type: "refund", amount_cents: order.total_cents,
        balance_after_cents: newBalance, order_id: order.id, description: "Remboursement commande annulée (admin)",
      })
      const { error: wErr } = await admin.from("wallets").update({
        balance_cents: newBalance, total_credited_cents: (wallet.total_credited_cents || 0) + order.total_cents,
        updated_at: new Date().toISOString(),
      }).eq("id", wallet.id)
      refunded = !txErr && !wErr
      if (txErr || wErr) console.error("[admin/orders/cancel] refund", txErr || wErr)
    }
  }
  return NextResponse.json({ ok: true, refunded })
}
