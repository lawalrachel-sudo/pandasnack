import { requireAdminPage } from "@/lib/auth/admin"
import { TicketsClient } from "./TicketsClient"

export const dynamic = "force-dynamic"

// PS-22 — Écran de capture d'un ticket de courses (photo + catégorie obligatoire + lignes).
// Enregistre dans tickets_achats via /api/admin/tickets. L'envoi Pennylane arrive plus tard.
export default async function TicketsPage() {
  await requireAdminPage()
  return <TicketsClient />
}
