import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import {
  anneeLaPlusRecente,
  elevesProposables,
  filtreAnnee,
  normalizeCreneau,
  type EleveConnu,
  type EleveProposable,
} from "@/lib/eleves-connus"

export const dynamic = "force-dynamic"

// PS-05c — Élèves déjà inscrits rattachés à l'e-mail du compte.
//
// `eleves_connus` est en RLS sans policy publique : elle n'est lisible qu'en service_role.
// Cette route est le SEUL point d'accès. Elle ne prend jamais l'e-mail en paramètre :
// il est lu depuis la session, sinon n'importe qui énumérerait la liste des élèves.
//
//   GET  → { eleves: EleveProposable[], annee }   élèves non encore ajoutés au compte
//   POST → { created: n, profils: [...] }         crée les profils enfants sélectionnés
//
// Le POST écrit en service_role et VÉRIFIE l'erreur (cause de l'échec muet de
// l'onboarding historique, cf. audit PS-05 §A-11).

type Metier = "ecole" | "pandattitude" | "panda_guest"

function metierFromSourceGroup(sg: string | null | undefined): Metier {
  if (sg === "ecole_la_patience") return "ecole"
  if (sg === "panda_guest") return "panda_guest"
  return "pandattitude"
}

type AccountCtx =
  | { error: NextResponse; account?: undefined; email?: undefined }
  | { error?: undefined; account: { id: string; source_group: string | null }; email: string }

// Auth + compte. Retourne l'erreur HTTP prête à renvoyer si quelque chose manque.
async function resolveAccount(): Promise<AccountCtx> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) }

  const { data: account } = await supabase
    .from("accounts").select("id, source_group").eq("auth_user_id", user.id).maybeSingle()
  if (!account) return { error: NextResponse.json({ error: "Compte introuvable" }, { status: 404 }) }

  const email = user.email || ""
  if (!email) return { error: NextResponse.json({ error: "Compte sans e-mail" }, { status: 400 }) }

  return { account, email }
}

export async function GET() {
  const ctx = await resolveAccount()
  if (ctx.error) return ctx.error
  const { account, email } = ctx

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant" }, { status: 500 })

  // Lecture bornée aux deux colonnes parent : on ne ramène jamais toute la table côté client.
  // Deux requêtes filtrées plutôt qu'un `.or()` construit par concaténation : l'e-mail est
  // passé comme valeur, jamais interpolé dans une expression de filtre PostgREST.
  const COLS = "id, annee, prenom, nom, classe, email_parent, email_parent2"
  const [r1, r2] = await Promise.all([
    admin.from("eleves_connus").select(COLS).ilike("email_parent", email),
    admin.from("eleves_connus").select(COLS).ilike("email_parent2", email),
  ])
  const error = r1.error || r2.error
  if (error) {
    console.error("[eleves-connus][GET]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const parId = new Map<string, EleveConnu>()
  for (const row of [...(r1.data || []), ...(r2.data || [])] as EleveConnu[]) parId.set(row.id, row)
  const eleves = [...parId.values()]
  const annee = anneeLaPlusRecente(eleves)

  // Prénoms déjà portés par un profil du compte (archivés inclus : on ne repropose pas
  // un enfant que le parent a retiré volontairement).
  const { data: profils } = await admin
    .from("profils").select("prenom").eq("account_id", account.id)

  const proposables = elevesProposables(
    filtreAnnee(eleves, annee),
    email,
    (profils || []).map((p: { prenom: string | null }) => p.prenom)
  )

  return NextResponse.json({ eleves: proposables, annee })
}

interface PostBody {
  // id de la ligne eleves_connus + créneau éventuellement choisi par le parent
  eleves?: Array<{ id: string; classe?: string | null; notes_allergies?: string | null }>
}

export async function POST(req: NextRequest) {
  const ctx = await resolveAccount()
  if (ctx.error) return ctx.error
  const { account, email } = ctx

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant" }, { status: 500 })

  const body = (await req.json().catch(() => ({}))) as PostBody
  const selection = Array.isArray(body.eleves) ? body.eleves : []
  if (selection.length === 0) {
    return NextResponse.json({ error: "Sélectionne au moins un enfant." }, { status: 400 })
  }

  // Re-lecture serveur des lignes demandées, toujours filtrée sur l'e-mail de la session :
  // un id d'élève appartenant à un autre parent est rejeté.
  const { data: rows, error: readErr } = await admin
    .from("eleves_connus")
    .select("id, annee, prenom, nom, classe, email_parent, email_parent2")
    .in("id", selection.map((s) => s.id))
  if (readErr) {
    console.error("[eleves-connus][POST][read]", readErr)
    return NextResponse.json({ error: readErr.message }, { status: 500 })
  }

  const autorises = elevesProposables((rows || []) as EleveConnu[], email)
  const parId = new Map<string, EleveProposable>(autorises.map((e) => [e.id, e]))

  const metier = metierFromSourceGroup(account.source_group)
  const manquants: string[] = []
  const aInserer: Array<{ prenom: string; classe: string | null; notes_allergies: string | null }> = []

  for (const s of selection) {
    const eleve = parId.get(s.id)
    if (!eleve) {
      return NextResponse.json({ error: "Élève non rattaché à ce compte." }, { status: 403 })
    }
    // Le créneau envoyé par le parent prime (cas où eleves_connus.classe est inexploitable).
    const classe = normalizeCreneau(s.classe) ?? eleve.classe
    if (metier !== "panda_guest" && !classe) {
      manquants.push(eleve.prenom)
      continue
    }
    aInserer.push({
      prenom: eleve.prenom,
      classe,
      notes_allergies: s.notes_allergies?.trim() || null,
    })
  }

  if (manquants.length > 0) {
    return NextResponse.json(
      { error: `Choisis le créneau pour : ${manquants.join(", ")}.` },
      { status: 400 }
    )
  }

  // `is_default` : un seul profil par défaut et par métier. Le trigger de création de
  // compte pose déjà un profil parent `is_default = true` → les enfants passent à false.
  // (Hypothèse de l'audit PS-05 : c'est cette collision qui faisait échouer l'insert
  // historique de l'onboarding. On ne dépend plus d'elle, on ne la provoque plus.)
  const { count: defautsExistants } = await admin
    .from("profils")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id)
    .eq("metier", metier)
    .eq("is_default", true)
    .is("archived_at", null)

  let resteUnDefaut = (defautsExistants || 0) === 0

  const rowsToInsert = aInserer.map((p) => {
    const is_default = resteUnDefaut
    if (resteUnDefaut) resteUnDefaut = false
    return {
      account_id: account.id,
      prenom: p.prenom,
      classe: p.classe,
      notes_allergies: p.notes_allergies,
      metier,
      type_profil: "eleve",
      active: true,
      is_default,
    }
  })

  const { data: created, error: insertErr } = await admin
    .from("profils")
    .insert(rowsToInsert)
    .select("id, prenom, classe, active, type_profil")

  // L'erreur est remontée telle quelle : c'est précisément ce qui manquait avant.
  if (insertErr) {
    console.error("[eleves-connus][POST][insert]", insertErr)
    return NextResponse.json({ error: `Création des profils impossible : ${insertErr.message}` }, { status: 500 })
  }
  if (!created || created.length === 0) {
    return NextResponse.json({ error: "Aucun profil n'a été créé." }, { status: 500 })
  }

  return NextResponse.json({ created: created.length, profils: created })
}
