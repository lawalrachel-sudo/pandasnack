import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// PS-25 — Catalogue des favoris de courses (liste, actif/inactif, rayon, libellé).
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase(); const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })
  const { data } = await admin.from("courses_catalogue")
    .select("id, libelle, categorie, fournisseur, unite, quantite_defaut, dernier_prix, actif").order("categorie").order("libelle")
  return NextResponse.json({ favoris: data || [] })
}

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase(); const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })
  const body = await req.json().catch(() => ({}))
  if (!body?.id) return NextResponse.json({ error: "id requis" }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.actif === "boolean") patch.actif = body.actif
  if (typeof body.categorie === "string") patch.categorie = body.categorie
  if (typeof body.libelle === "string" && body.libelle.trim()) patch.libelle = body.libelle.trim()
  const { error } = await admin.from("courses_catalogue").update(patch).eq("id", body.id)
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Ce libellé existe déjà." : error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
