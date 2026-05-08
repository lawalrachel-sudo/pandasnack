import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin, SOURCE_LABELS } from "@/lib/auth/admin"

export const dynamic = "force-dynamic"

// GET /api/admin/profils — liste tous les profils (admin only)
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const { data, error } = await supabase
    .from("profils")
    .select(`
      id, prenom, classe, metier, is_default, active, archived_at, notes_allergies, created_at,
      accounts(id, nom_compte, email, source_group)
    `)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[admin/profils GET]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profils = (data || []).map((p: any) => ({
    id: p.id,
    prenom: p.prenom,
    classe: p.classe,
    metier: p.metier,
    is_default: p.is_default,
    active: p.active,
    archived: !!p.archived_at,
    notes_allergies: p.notes_allergies,
    parent_nom: p.accounts?.nom_compte || "—",
    parent_email: p.accounts?.email || null,
    source_group: p.accounts?.source_group || null,
    source_label: SOURCE_LABELS[p.accounts?.source_group] || p.accounts?.source_group || "—",
  }))

  return NextResponse.json({ profils })
}
