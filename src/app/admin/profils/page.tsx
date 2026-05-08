import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { isAdmin } from "@/lib/auth/admin"
import { ProfilsClient } from "./ProfilsClient"

export const dynamic = "force-dynamic"

export default async function AdminProfilsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth?next=/admin/profils")
  if (!isAdmin(user)) redirect("/?error=admin_required")

  return <ProfilsClient />
}
