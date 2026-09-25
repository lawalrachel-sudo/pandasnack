import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { CLASSES_PAR_METIER, classeValidePourMetier, type Metier } from "@/lib/profil-gate"

export const dynamic = "force-dynamic"

// PATCH /api/admin/profils/[id]
// Body : { classe?: string | null, prenom?: string }
// Update un profil (admin only). Pour l'instant : classe (texte libre) + prenom.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })

  // PS-05c — le métier du profil est nécessaire pour valider `classe` (voir plus bas).
  const { data: existing } = await supabase
    .from("profils").select("id, metier").eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if ("classe" in body) {
    const v = body.classe
    if (v === null || v === "") updates.classe = null
    else if (typeof v === "string") {
      // PS-05c — `classe` n'est plus du texte libre. L'ancien champ acceptait n'importe
      // quoi jusqu'à 32 caractères ; des profils parents ont ainsi reçu
      // classe = 'Pandattitude', ce qui les rendait sélectionnables à la commande.
      const metier: Metier = existing.metier === "ecole" || existing.metier === "panda_guest"
        ? existing.metier
        : "pandattitude"
      const classe = v.trim()
      if (!classeValidePourMetier(classe, metier)) {
        return NextResponse.json({
          error: `Classe invalide pour ${metier}. Valeurs attendues : ${CLASSES_PAR_METIER[metier].join(", ") || "aucune"}.`,
        }, { status: 400 })
      }
      updates.classe = classe
    }
    else return NextResponse.json({ error: "classe doit être string ou null" }, { status: 400 })
  }
  if ("prenom" in body) {
    if (typeof body.prenom !== "string" || !body.prenom.trim()) {
      return NextResponse.json({ error: "prenom invalide" }, { status: 400 })
    }
    updates.prenom = body.prenom.trim().slice(0, 64)
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucun champ à modifier" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("profils")
    .update(updates)
    .eq("id", id)
    .select("id, prenom, classe, metier, account_id, is_default, active")
    .single()

  if (error) {
    console.error("[admin/profils PATCH]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ profil: data })
}
