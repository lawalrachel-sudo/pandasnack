import { redirect } from "next/navigation"
import { hasValidAdminCookie } from "@/lib/auth/admin-cookie"
import { createServerSupabase } from "@/lib/supabase/server"
import { isAdmin } from "@/lib/auth/admin"
import { AdminLoginClient } from "./AdminLoginClient"

export const dynamic = "force-dynamic"

// Page d'accès admin : 1 champ mot de passe → dashboard.
// Si déjà admin (cookie mot de passe OU compte Supabase whitelisté) → dashboard direct.
export default async function AdminLoginPage() {
  if (await hasValidAdminCookie()) redirect("/admin/dashboard")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (isAdmin(user)) redirect("/admin/dashboard")

  return <AdminLoginClient />
}
