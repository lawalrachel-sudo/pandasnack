import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { notifyNewOrder } from "@/lib/notify"

export const dynamic = "force-dynamic"

interface SknItem {
  catalog_item_id: string
  is_formula?: boolean
  menu_formula_id?: string | null
  profil_id: string
  prenom_libre?: string | null
  sauce?: boolean
  notes?: string | null
}

// Messages parents pour chaque refus de la RPC (le reste → message générique).
const MESSAGES: Record<string, string> = {
  SKN_FERME: "Sa ki ni est fermé pour aujourd'hui (jusqu'à 10h30 seulement).",
  SKN_EPUISE: "Cette portion vient d'être prise. Il n'en reste plus.",
  SKN_NON_OFFERT: "Ce plat n'est pas proposé aujourd'hui.",
  SKN_NON_OK: "Ce plat n'est pas disponible en Sa ki ni.",
  SKN_PROFIL_REQUIS: "Choisis un enfant pour cette commande.",
  SOLDE_INSUFFISANT: "Solde Panda Wallet insuffisant.",
}

// POST /api/sa-ki-ni/commander — crée + paie (wallet) une commande Sa ki ni via la RPC.
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authed: any = await createServerSupabase()
  const { data: { user } } = await authed.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const slotId: string | undefined = body?.slotId
  const items: SknItem[] = Array.isArray(body?.items) ? body.items : []
  const idempotencyKey: string | undefined = body?.idempotencyKey
  if (!slotId || items.length === 0) return NextResponse.json({ error: "Données manquantes" }, { status: 400 })

  const payload = {
    slot_id: slotId,
    idempotency_key: idempotencyKey || null,
    items: items.map((i) => ({
      catalog_item_id: i.catalog_item_id,
      is_formula: !!i.is_formula,
      menu_formula_id: i.menu_formula_id || null,
      profil_id: i.profil_id,
      prenom_libre: i.prenom_libre || null,
      topping_ids: i.sauce && body?.sauceToppingId ? [body.sauceToppingId] : null,
      notes: i.notes || null,
    })),
  }

  const { data, error } = await authed.rpc("sa_ki_ni_commander", { p_payload: payload })
  if (error) {
    const code = Object.keys(MESSAGES).find((k) => (error.message || "").includes(k))
    const msg = code ? MESSAGES[code] : "La commande Sa ki ni a échoué. Réessaie."
    const status = code === "SOLDE_INSUFFISANT" ? 402 : 400
    return NextResponse.json({ error: msg, code: code || null }, { status })
  }
  const row = Array.isArray(data) ? data[0] : data
  // Notif secrétariat (non bloquante) — objet préfixé « 🍽️ Sa ki ni · » via orders.sa_ki_ni.
  if (row?.order_id) { try { await notifyNewOrder(row.order_id) } catch { /* non bloquant */ } }
  return NextResponse.json({
    ok: true,
    orderNumber: row?.order_number || null,
    totalCents: row?.total_cents ?? null,
    walletBalanceAfter: row?.wallet_balance_after ?? null,
  })
}
