import { redirect } from "next/navigation"
import { hasValidAdminCookie } from "@/lib/auth/admin-cookie"
import { createServerSupabase } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/admin"
import { AdminLoginClient } from "./AdminLoginClient"

export const dynamic = "force-dynamic"

// PS-11 — destination après connexion : ?next=… (borné à /admin/… pour éviter l'open-redirect),
// défaut /admin/home.
function safeNext(next: string | undefined): string {
  if (next && next.startsWith("/admin") && !next.startsWith("//")) return next
  return "/admin/home"
}

// Page d'accès admin : 1 champ mot de passe → dashboard.
// Si déjà admin (cookie mot de passe OU compte avec accounts.is_admin) → destination.
export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const dest = safeNext((await searchParams).next)

  if (await hasValidAdminCookie()) redirect(dest)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (await isAdminUser(supabase, user)) redirect(dest)

  return <AdminLoginClient next={dest} />
}
