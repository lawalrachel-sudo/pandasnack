import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"
import { CLASSES_PAR_METIER, classeValidePourMetier, type Metier } from "@/lib/profil-gate"

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

  // PS-05c — `classe` doit appartenir au référentiel du métier (même garde qu'au PATCH) :
  // une classe hors référentiel produirait un profil non commandable, donc invisible.
  const classeNettoyee = typeof classe === "string" ? classe.trim() : classe
  if (classeNettoyee && !classeValidePourMetier(String(classeNettoyee), derivedMetier as Metier)) {
    return NextResponse.json({
      error: `Classe invalide. Valeurs attendues : ${CLASSES_PAR_METIER[derivedMetier as Metier].join(", ") || "aucune"}.`,
    }, { status: 400 })
  }

  // PS-05c — `is_default` se décide sur les profils DÉJÀ marqués par défaut pour ce
  // métier, pas sur le nombre de profils actifs. Le trigger de création de compte pose
  // un profil parent `is_default = true` (inactif) : l'ancien calcul repassait donc
  // `is_default: true` sur un compte neuf et entrait en collision avec lui.
  const { count } = await supabase
    .from("profils").select("id", { count: "exact", head: true })
    .eq("account_id", account.id).eq("metier", derivedMetier)
    .eq("is_default", true).is("archived_at", null)

  const { data: profil, error } = await supabase
    .from("profils")
    .insert({
      account_id: account.id,
      prenom: prenom.trim(),
      classe: classeNettoyee || null,
      notes_allergies: notes_allergies || null,
      metier: derivedMetier,
      // Panda Guest = le parent commande pour lui-même ; sinon on crée un profil enfant.
      type_profil: derivedMetier === "panda_guest" ? "adulte" : "eleve",
      is_default: (count || 0) === 0,
      active: true,
    })
    .select("id, prenom, metier, classe, active, type_profil")
    .single()

  if (error) {
    console.error("[profils][POST]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!profil) return NextResponse.json({ error: "Profil non créé" }, { status: 500 })
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
    .from("profils").select("id, metier, type_profil").eq("id", profilId).eq("account_id", account.id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 })

  const metier: Metier = existing.metier === "ecole" || existing.metier === "panda_guest"
    ? existing.metier
    : "pandattitude"

  const allowedFields: Record<string, unknown> = {}
  if ("active" in updates) {
    // PS-05c — le profil « parent » (type_profil = 'adulte') créé par le trigger de
    // création de compte ne doit jamais devenir commandable sur École / Pandattitude :
    // un compte avait passé commande dessus après une réactivation (audit PS-05).
    if (updates.active === true && metier !== "panda_guest" && existing.type_profil !== "eleve") {
      return NextResponse.json({
        error: "Ce profil est le profil du compte parent : il ne peut pas être activé pour commander. Ajoute un profil enfant.",
      }, { status: 400 })
    }
    allowedFields.active = updates.active
  }
  if ("prenom" in updates) allowedFields.prenom = updates.prenom
  if ("classe" in updates) {
    const v = updates.classe
    const classe = typeof v === "string" ? v.trim() : v
    // Même référentiel que la garde de commande : pas de classe en texte libre.
    if (classe !== null && classe !== "" && !classeValidePourMetier(String(classe), metier)) {
      return NextResponse.json({
        error: `Classe invalide. Valeurs attendues : ${CLASSES_PAR_METIER[metier].join(", ") || "aucune"}.`,
      }, { status: 400 })
    }
    allowedFields.classe = classe === "" ? null : classe
  }
  if ("notes_allergies" in updates) allowedFields.notes_allergies = updates.notes_allergies

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: "Aucun champ à modifier" }, { status: 400 })
  }

  const { data: patched, error } = await supabase
    .from("profils").update(allowedFields).eq("id", profilId).eq("account_id", account.id)
    .select("id, active, classe")

  if (error) {
    console.error("[profils][PATCH]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!patched || patched.length === 0) {
    return NextResponse.json({ error: "Profil non modifié" }, { status: 409 })
  }
  return NextResponse.json({ success: true, profil: patched[0] })
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
