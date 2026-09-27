import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { planForJob, isEmptyZ, type CronJob } from "@/lib/cron-cloture"

export const dynamic = "force-dynamic"

// GET /api/cron/cloture?job=jour|mois|annee — PS-08a-b. Clôture automatique (Vercel Cron).
// Protégé par CRON_SECRET : Vercel envoie « Authorization: Bearer $CRON_SECRET ». Aucune
// action de Rachel. Idempotent (caisse_close ne réinsère pas). L'appli n'encaisse rien.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get("authorization") || ""
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const job = (new URL(req.url).searchParams.get("job") || "jour") as CronJob
  if (!["jour", "mois", "annee"].includes(job)) {
    return NextResponse.json({ error: "job invalide" }, { status: 400 })
  }

  const plan = planForJob(job, undefined, process.env.CLOSING_YEAR_START || "01-01")
  if (!plan) return NextResponse.json({ skipped: true, reason: "pas de clôture ce jour", job })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  if (plan.onlyIfActivity) {
    const { data: z, error } = await admin.rpc("caisse_z", { p_start: plan.start, p_end: plan.start })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (isEmptyZ(z)) return NextResponse.json({ skipped: true, reason: "aucune activité", ...plan })
  }

  const { data, error } = await admin.rpc("caisse_close", { p_type: plan.type, p_start: plan.start })
  if (error) {
    console.error("[cron/cloture]", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, ...plan, cloture_id: data?.id })
}
