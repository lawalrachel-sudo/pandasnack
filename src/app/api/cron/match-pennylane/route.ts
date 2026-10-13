import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// GET /api/cron/match-pennylane — PS-22. Rapprochement quotidien (Vercel Cron). Protégé par
// CRON_SECRET. Invoque l'Edge Function match-pennylane (qui porte le jeton Pennylane). Idempotent
// (ne traite que les tickets 'envoye' payés carte_ltc ; ne force rien si 0 ou 2+ candidats).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get("authorization") || ""
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data, error } = await admin.functions.invoke("match-pennylane", { body: {} })
  if (error) return NextResponse.json({ error: error.message }, { status: 502 })
  return NextResponse.json(data || { ok: true })
}
