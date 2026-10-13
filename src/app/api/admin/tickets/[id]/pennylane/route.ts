import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// PS-22 — POST /api/admin/tickets/[id]/pennylane : envoie un ticket à Pennylane (facture fournisseur
// + pièce jointe) en invoquant l'Edge Function push-pennylane (qui porte le secret du jeton).
// La route ne voit JAMAIS le jeton Pennylane. Idempotence gérée côté fonction (pennylane_invoice_id).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { id } = await ctx.params
  const { data, error } = await admin.functions.invoke("push-pennylane", { body: { ticket_id: id } })
  if (error) return NextResponse.json({ error: error.message || "Échec de l'envoi" }, { status: 502 })
  if (data?.error) return NextResponse.json({ error: data.error }, { status: 502 })
  return NextResponse.json(data || { ok: true })
}
