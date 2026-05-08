import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { isAdmin } from "@/lib/auth/admin"
import { ListeClient } from "./ListeClient"

export const dynamic = "force-dynamic"

export default async function ListePage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>
  searchParams: Promise<{ source_group?: string }>
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth?next=/admin/dashboard")
  if (!isAdmin(user)) redirect("/?error=admin_required")

  const { date } = await params
  const sp = await searchParams
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/admin/dashboard")

  return <ListeClient serviceDate={date} sourceGroup={sp.source_group || ""} />
}
