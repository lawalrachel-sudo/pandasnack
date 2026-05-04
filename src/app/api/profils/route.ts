import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"

// POST — Ajouter un profil
export async function POST(req: NextRequest) {
  const supabase: any = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  const { data: account } = await supabase
    .from("accounts").select("id, source_group").eq("auth_user_id", user.id).single()
  if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })

  const { prenom, classe, notes_allergies, metier } = await req.json()
  if (!prenom?.trim()) return NextResponse.json({ error: "Prénom requis" }, { status: 400 })

  // BUG B — metier dérivé du source_group du compte si non fourni
  // Mapping : ecole_la_patience -> ecole, autres conservés
  const derivedMetier = (() => {
    if (metier && ["ecole","pandattitude","panda_guest"].includes(metier)) return metier
    if (account.source_group === "ecole_la_patience") return "ecole"
    if (account.source_group === "pandattitude") return "pandattitude"
    if (account.source_group === "panda_guest") return "panda_guest"
    return "ecole"
  })()

  // Vérifier si c'est le premier profil de ce metier (sera default pour ce metier)
  const { count } = await supabase
    .from("profils").select("id", { count: "exact", head: true })
    .eq("account_id", account.id).eq("metier", derivedMetier).eq("active", true)

  const { data: profil, error } = await supabase
    .from("profils")
    .insert({
      account_id: account.id,
      prenom: prenom.trim(),
      classe: classe || null,
      notes_allergies: notes_allergies || null,
      metier: derivedMetier,
      is_default: (count || 0) === 0,
      active: true,
    })
    .select("id, prenom, metier")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, profil })
}

// PATCH — Modifier un profil (activer/désactiver, modifier infos)
export async function PATCH(req: NextRequest) {
  const supabase: any = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  const { data: account } = await supabase
    .from("accounts").select("id").eq("auth_user_id", user.id).single()
  if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })

  const body = await req.json()
  const { profilId, ...updates } = body
  if (!profilId) return NextResponse.json({ error: "profilId requis" }, { status: 400 })

  // Vérifier que le profil appartient à ce compte
  const { data: existing } = await supabase
    .from("profils").select("id").eq("id", profilId).eq("account_id", account.id).single()
  if (!existing) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 })

  const allowedFields: Record<string, unknown> = {}
  if ("active" in updates) allowedFields.active = updates.active
  if ("prenom" in updates) allowedFields.prenom = updates.prenom
  if ("classe" in updates) allowedFields.classe = updates.classe
  if ("notes_allergies" in updates) allowedFields.notes_allergies = updates.notes_allergies

  const { error } = await supabase
    .from("profils").update(allowedFields).eq("id", profilId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE — Soft delete (archived_at = NOW), avec garde-fou ≥ 1 profil non archivé
export async function DELETE(req: NextRequest) {
  const supabase: any = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  const { data: account } = await supabase
    .from("accounts").select("id").eq("auth_user_id", user.id).single()
  if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })

  const profilId = req.nextUrl.searchParams.get("profilId")
  if (!profilId) return NextResponse.json({ error: "profilId requis" }, { status: 400 })

  // Vérifier ownership
  const { data: existing } = await supabase
    .from("profils").select("id, archived_at")
    .eq("id", profilId).eq("account_id", account.id).single()
  if (!existing) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 })
  if (existing.archived_at) return NextResponse.json({ error: "Profil déjà archivé" }, { status: 400 })

  // POINT 3 — guard "≥ 1 profil" retiré : un compte peut avoir 0 profil le temps
  // d'en re-créer un (utilisateur peut vouloir supprimer son seul profil).
  // Le sélecteur "Commande pour" gère gracieusement le cas vide.

  const { error } = await supabase
    .from("profils")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", profilId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
