import { requireAdminPage } from "@/lib/auth/admin"
import { HistoriqueClient } from "./HistoriqueClient"

export const dynamic = "force-dynamic"

export default async function BubbleHistoriquePage() {
  await requireAdminPage()
  return <HistoriqueClient />
}
