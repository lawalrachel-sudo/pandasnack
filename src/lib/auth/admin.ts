import { NextResponse } from "next/server"
import type { User, SupabaseClient } from "@supabase/supabase-js"

// v1.12 — auth admin v1 simple : whitelist email Rachel.
// À raffiner plus tard avec table admins ou rôle Supabase (claim app_role='admin').
// Structure prévue pour accueillir un Bearer token machine plus tard sans casse.
export const ADMIN_EMAILS = new Set<string>([
  "lawalrachel@gmail.com",
])

export function isAdmin(user: User | null | undefined): boolean {
  if (!user?.email) return false
  return ADMIN_EMAILS.has(user.email.toLowerCase())
}

// Utilisé dans toutes les routes /api/admin/*. Retourne soit { user } soit { error: NextResponse }
// — l'appelant doit checker si "error" présent et le retourner direct.
export async function requireAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>
): Promise<{ user: User } | { error: NextResponse }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) }
  }
  if (!isAdmin(user)) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) }
  }
  return { user }
}

// Mapping source_group DB → label affichage (utilisé en API responses + UI)
export const SOURCE_LABELS: Record<string, string> = {
  ecole_la_patience: "École La Patience",
  pandattitude: "Pandattitude",
  panda_guest: "Panda Guest",
}
