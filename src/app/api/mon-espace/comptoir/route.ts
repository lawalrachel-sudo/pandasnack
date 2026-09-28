import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// GET /api/mon-espace/comptoir — PS-08b. Achats au comptoir des enfants du compte connecté.
// Session parent → account_id ; lecture service_role STRICTEMENT filtrée sur ce compte
// (jamais d'accès direct client à comptoir_sales).
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  const { data: account } = await supabase
    .from("accounts").select("id").eq("auth_user_id", user.id).single()
  if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data: rows, error } = await admin
    .from("comptoir_sales")
    .select("id, sale_number, service_date, created_at, prenom, items, payment_mode, jeton_qty, total_cents, reverses_sale_id")
    .eq("account_id", account.id)          // strictement le compte connecté
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Marque les ventes annulées (celles qui ont une contre-écriture).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (rows || []) as any[]
  const reversedIds = new Set(all.filter((r) => r.reverses_sale_id).map((r) => r.reverses_sale_id as string))
  const sales = all
    .filter((r) => !r.reverses_sale_id)   // on n'affiche pas les lignes de contre-écriture
    .map((r) => ({
      id: r.id, sale_number: r.sale_number, service_date: r.service_date, created_at: r.created_at,
      prenom: r.prenom, items: r.items || [], payment_mode: r.payment_mode, jeton_qty: r.jeton_qty,
      total_cents: r.total_cents, annulee: reversedIds.has(r.id),
    }))

  return NextResponse.json({ sales })
}
