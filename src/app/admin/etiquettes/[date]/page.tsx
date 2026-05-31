import { redirect } from "next/navigation"
import { requireAdminPage } from "@/lib/auth/admin"
import { EtiquettesClient } from "./EtiquettesClient"

export const dynamic = "force-dynamic"

export default async function EtiquettesPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  await requireAdminPage()

  const { date } = await params
  // Validation YYYY-MM-DD basique
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/admin/dashboard")

  return <EtiquettesClient serviceDate={date} />
}
