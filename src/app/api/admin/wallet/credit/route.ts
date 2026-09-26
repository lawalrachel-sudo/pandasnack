import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { VALID_CREDIT_MODES, planCredit } from "@/lib/wallet-bonus"

export const dynamic = "force-dynamic"

// POST /api/admin/wallet/credit — PS-06a §3 : crédit manuel du wallet au comptoir.
// Body : { accountId, amountCents, bonusCents, mode, note? }
// Header : Idempotency-Key (obligatoire) — un double clic réutilise la clé et ne crédite pas deux fois.
//
// Effet : insert wallet_transactions (type 'adjustment', montant = amountCents + bonusCents,
// balance_after, description explicite avec bonus à part) + update wallets (balance_cents,
// total_credited_cents, updated_at). Le bonus est RETENU tel que fourni (l'admin a pu décocher).
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const idemKey = req.headers.get("Idempotency-Key")
  if (!idemKey) return NextResponse.json({ error: "Idempotency-Key requis" }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    accountId?: string; amountCents?: number; bonusCents?: number; mode?: string; note?: string
  }
  const { accountId, mode } = body
  const amountCents = Math.round(Number(body.amountCents))
  const bonusCents = Math.max(0, Math.round(Number(body.bonusCents) || 0))

  if (!accountId) return NextResponse.json({ error: "accountId requis" }, { status: 400 })
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Montant invalide" }, { status: 400 })
  }
  if (!mode || !VALID_CREDIT_MODES.includes(mode)) {
    return NextResponse.json({ error: `Mode invalide (${VALID_CREDIT_MODES.join(" | ")})` }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  // Court-circuit idempotence : si la clé existe déjà, on ne refait rien.
  const { data: dup } = await admin
    .from("wallet_transactions").select("id, balance_after_cents").eq("idempotency_key", idemKey).maybeSingle()
  if (dup) return NextResponse.json({ success: true, duplicate: true, balance_after_cents: dup.balance_after_cents })

  // Wallet du compte (créé si absent — un compte peut ne pas encore avoir de wallet).
  let { data: wallet } = await admin
    .from("wallets").select("id, balance_cents, total_credited_cents").eq("account_id", accountId).maybeSingle()
  if (!wallet) {
    const { data: created, error: cErr } = await admin
      .from("wallets").insert({ account_id: accountId, balance_cents: 0, total_credited_cents: 0 })
      .select("id, balance_cents, total_credited_cents").single()
    if (cErr || !created) {
      console.error("[wallet/credit] create wallet:", cErr)
      return NextResponse.json({ error: "Wallet introuvable" }, { status: 404 })
    }
    wallet = created
  }

  const plan = planCredit({
    amountCents, bonusCents, mode, note: body.note,
    currentBalanceCents: wallet.balance_cents, currentTotalCreditedCents: wallet.total_credited_cents || 0,
  })

  // Insert transaction AVEC la clé : c'est elle qui verrouille l'idempotence (unique index).
  const { error: txErr } = await admin.from("wallet_transactions").insert({
    wallet_id: wallet.id,
    type: "adjustment",
    amount_cents: plan.totalCreditCents,
    balance_after_cents: plan.newBalanceCents,
    description: plan.description,
    idempotency_key: idemKey,
    // created_by est un uuid : l'accès admin peut se faire par cookie (sans user Supabase),
    // on laisse NULL. La provenance « admin » est portée par type='adjustment' + description.
  })
  if (txErr) {
    if ((txErr as { code?: string }).code === "23505") {
      // Course : une autre requête a gagné la clé → pas de double crédit.
      return NextResponse.json({ success: true, duplicate: true })
    }
    console.error("[wallet/credit] tx:", txErr)
    return NextResponse.json({ error: txErr.message }, { status: 500 })
  }

  const { error: wErr } = await admin.from("wallets").update({
    balance_cents: plan.newBalanceCents,
    total_credited_cents: plan.newTotalCreditedCents,
    updated_at: new Date().toISOString(),
  }).eq("id", wallet.id)
  if (wErr) {
    console.error("[wallet/credit] wallet update:", wErr)
    return NextResponse.json({ error: "Crédit enregistré mais solde non mis à jour — vérifier." }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    amount_cents: plan.amountCents,
    bonus_cents: plan.bonusCents,
    total_credit_cents: plan.totalCreditCents,
    balance_after_cents: plan.newBalanceCents,
    description: plan.description,
  })
}
