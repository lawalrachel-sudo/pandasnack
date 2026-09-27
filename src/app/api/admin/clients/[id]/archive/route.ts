import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// POST /api/admin/clients/[id]/archive — PS-06f. Idempotent : archive le compte (archived_at).
// Ne touche ni wallet, ni commandes, ni profils. requireAdmin + service_role.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data, error } = await admin
    .from("accounts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)          // idempotent : ne réécrit pas une date déjà posée
    .select("id, archived_at")
  if (error) {
    console.error("[clients/archive]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // 0 ligne = déjà archivé (idempotent) → succès.
  return NextResponse.json({ success: true, archived_at: data?.[0]?.archived_at ?? null, alreadyArchived: !data?.length })
}
