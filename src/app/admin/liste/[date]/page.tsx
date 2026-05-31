import { redirect } from "next/navigation"
import { requireAdminPage } from "@/lib/auth/admin"
import { ListeClient } from "./ListeClient"

export const dynamic = "force-dynamic"

export default async function ListePage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>
  searchParams: Promise<{ source_group?: string }>
}) {
  await requireAdminPage()

  const { date } = await params
  const sp = await searchParams
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/admin/dashboard")

  return <ListeClient serviceDate={date} sourceGroup={sp.source_group || ""} />
}
