import { NextResponse } from "next/server"
import { redirect } from "next/navigation"
import type { User, SupabaseClient } from "@supabase/supabase-js"
import { hasValidAdminCookie } from "./admin-cookie"
import { createServerSupabase } from "@/lib/supabase/server"

// v2 (12/06/2026) — l'accès admin "compte" repose sur accounts.is_admin (flag DB permanent),
// remplaçant l'ancienne whitelist email en dur (ADMIN_EMAILS). La 2e voie (cookie mot de passe
// signé) reste inchangée. L'écriture de is_admin est verrouillée côté DB (trigger
// guard_accounts_is_admin : seul le service role / une connexion directe peut le changer).

// Lit accounts.is_admin pour le user connecté (sa PROPRE ligne — lecture RLS autorisée).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isAdminUser(supabase: any, user: User | null | undefined): Promise<boolean> {
  if (!user) return false
  const { data } = await supabase.from("accounts").select("is_admin").eq("auth_user_id", user.id).maybeSingle()
  return !!data?.is_admin
}

// Utilisé dans toutes les routes /api/admin/*. Retourne soit { user } soit { error: NextResponse }
// — l'appelant doit checker si "error" présent et le retourner direct.
// Deux voies d'accès admin acceptées :
//   1. cookie admin signé (accès mot de passe, indépendant de Supabase) → user = null
//   2. compte Supabase dont accounts.is_admin = true
export async function requireAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>
): Promise<{ user: User | null } | { error: NextResponse }> {
  if (await hasValidAdminCookie()) return { user: null }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) }
  }
  if (!(await isAdminUser(supabase, user))) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) }
  }
  return { user }
}

// Garde server-side pour les server components /admin/*. Même double voie que requireAdmin
// (cookie mot de passe OU compte avec accounts.is_admin). Redirige vers / si ni l'un ni l'autre.
// Retourne l'email admin (vide si accès par cookie mot de passe).
export async function requireAdminPage(): Promise<{ userEmail: string }> {
  if (await hasValidAdminCookie()) return { userEmail: "" }

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isAdminUser(supabase, user))) redirect("/")
  return { userEmail: user.email || "" }
}

// Mapping source_group DB → label affichage (utilisé en API responses + UI)
export const SOURCE_LABELS: Record<string, string> = {
  ecole_la_patience: "École La Patience",
  pandattitude: "Pandattitude",
  panda_guest: "Panda Guest",
}
