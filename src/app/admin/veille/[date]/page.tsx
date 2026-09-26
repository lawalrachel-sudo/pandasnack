import { redirect } from "next/navigation"
import { requireAdminPage } from "@/lib/auth/admin"
import { VeilleClient } from "./VeilleClient"

export const dynamic = "force-dynamic"

// PS-06b §6 — Feuille de route imprimable A4 d'un service.
export default async function VeillePage({ params }: { params: Promise<{ date: string }> }) {
  await requireAdminPage()
  const { date } = await params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/admin/dashboard")
  return <VeilleClient serviceDate={date} />
}
