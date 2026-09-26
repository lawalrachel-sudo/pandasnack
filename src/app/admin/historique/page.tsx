import { requireAdminPage } from "@/lib/auth/admin"
import { HistoriqueClient } from "./HistoriqueClient"

export const dynamic = "force-dynamic"

// PS-06b §12 — Historique minimal : CA payé par service (compta). Détail caisse en PS-08.
export default async function HistoriquePage() {
  await requireAdminPage()
  return <HistoriqueClient />
}
