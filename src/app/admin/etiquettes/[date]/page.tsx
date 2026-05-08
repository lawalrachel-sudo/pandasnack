import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { isAdmin } from "@/lib/auth/admin"
import { EtiquettesClient } from "./EtiquettesClient"

export const dynamic = "force-dynamic"

export default async function EtiquettesPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth?next=/admin/dashboard")
  if (!isAdmin(user)) redirect("/?error=admin_required")

  const { date } = await params
  // Validation YYYY-MM-DD basique
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/admin/dashboard")

  return <EtiquettesClient serviceDate={date} />
}
