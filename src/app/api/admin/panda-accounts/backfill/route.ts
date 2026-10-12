import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { classeToCreneau } from "@/lib/creneau"
import { prenomKey, normalizeEmail } from "@/lib/eleves-connus"

export const dynamic = "force-dynamic"

// PS-20 — Rattrapage : pré-crée les comptes famille (sans mot de passe, SANS e-mail) pour les
// familles inscrites sans compte Snack, puis crée les profils enfants (via pandasnack_sync_eleve).
// GET = dry-run (lecture seule) : ce que le rattrapage CRÉERAIT + cas ambigus.
// POST { execute: true } = exécution réelle (jamais lancé en prod sans GO de Rachel).

interface Eleve { id: string; annee: string; prenom: string; nom: string | null; classe: string; email_parent: string; email_parent2: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function compute(admin: any) {
  const { data: elevesAll } = await admin.from("eleves_connus")
    .select("id, annee, prenom, nom, classe, email_parent, email_parent2")
  const eleves = (elevesAll || []) as Eleve[]
  const annee = eleves.map((e) => e.annee).sort().reverse()[0] || null
  const rows = eleves.filter((e) => e.annee === annee)

  // Comptes existants par e-mail.
  const { data: accAll } = await admin.from("accounts").select("id, email")
  const accByEmail = new Map<string, string>()
  for (const a of (accAll || []) as { id: string; email: string | null }[]) accByEmail.set(normalizeEmail(a.email), a.id)

  // Profils existants (prénom normalisé) par compte.
  const { data: profAll } = await admin.from("profils").select("account_id, prenom")
  const profByAccount = new Map<string, Set<string>>()
  for (const p of (profAll || []) as { account_id: string; prenom: string | null }[]) {
    if (!profByAccount.has(p.account_id)) profByAccount.set(p.account_id, new Set())
    profByAccount.get(p.account_id)!.add(prenomKey(p.prenom))
  }

  const famillesSansCompte = new Set<string>()
  let profilsACreer = 0
  const ambigus: Array<{ prenom: string; nom: string | null; classe: string; jour: string | null }> = []

  for (const e of rows) {
    const ep = normalizeEmail(e.email_parent)
    const ep2 = normalizeEmail(e.email_parent2)
    const accId = accByEmail.get(ep) || (ep2 ? accByEmail.get(ep2) : undefined)
    if (!accId) famillesSansCompte.add(ep)

    const cr = classeToCreneau(e.classe)
    if (cr.ambiguous) ambigus.push({ prenom: e.prenom, nom: e.nom, classe: e.classe, jour: cr.jour })

    // Profil créé si (compte existe OU sera créé) ET classe exploitable ET pas déjà un profil au prénom.
    const existing = accId ? profByAccount.get(accId) : undefined
    const dejaProfil = existing?.has(prenomKey(e.prenom)) || false
    if (cr.jour && !dejaProfil) profilsACreer += 1
  }

  return {
    annee,
    elevesAnnee: rows.length,
    comptesExistants: new Set(rows.map((e) => normalizeEmail(e.email_parent)).filter((ep) => accByEmail.has(ep))).size,
    comptesACreer: famillesSansCompte.size,
    profilsACreer,
    ambigus,
  }
}

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })
  return NextResponse.json({ dryRun: true, ...(await compute(admin)) })
}

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  if (body?.execute !== true) return NextResponse.json({ error: "Ajoute { execute: true } pour lancer le rattrapage." }, { status: 400 })

  const { data: elevesAll } = await admin.from("eleves_connus")
    .select("id, annee, prenom, nom, classe, email_parent, email_parent2")
  const eleves = (elevesAll || []) as Eleve[]
  const annee = eleves.map((e) => e.annee).sort().reverse()[0] || null
  const rows = eleves.filter((e) => e.annee === annee)

  const { data: accAll } = await admin.from("accounts").select("id, email")
  const has = new Set((accAll || []).map((a: { email: string | null }) => normalizeEmail(a.email)))

  // 1. Pré-créer les comptes manquants (sans mot de passe, SANS e-mail). createUser n'envoie rien.
  let comptesCrees = 0
  const emailsACreer = Array.from(new Set(rows.map((e) => normalizeEmail(e.email_parent))
    .filter((ep) => ep && !has.has(ep)
      && !rows.some((r) => normalizeEmail(r.email_parent) === ep && r.email_parent2 && has.has(normalizeEmail(r.email_parent2))))))
  for (const email of emailsACreer) {
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (!error) comptesCrees += 1
    else console.error("[backfill] createUser", email, error.message)
  }

  // 2. Créer les profils (idempotent) pour toutes les lignes de l'année via la fonction SQL.
  let synced = 0
  for (const e of rows) {
    const { error } = await admin.rpc("pandasnack_sync_eleve", { p_eleve_id: e.id })
    if (!error) synced += 1
  }

  return NextResponse.json({ executed: true, annee, comptesCrees, lignesSync: synced })
}
