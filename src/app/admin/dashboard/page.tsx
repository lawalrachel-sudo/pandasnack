import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { isAdmin } from "@/lib/auth/admin"
import { DashboardClient } from "./DashboardClient"

export const dynamic = "force-dynamic"

export default async function AdminDashboardPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth?next=/admin/dashboard")
  if (!isAdmin(user)) redirect("/?error=admin_required")

  return <DashboardClient userEmail={user.email || ""} />
}
