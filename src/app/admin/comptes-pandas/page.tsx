import { requireAdminPage } from "@/lib/auth/admin"
import { ComptesPandasClient } from "./ComptesPandasClient"

export const dynamic = "force-dynamic"

// PS-20b — Écran admin « Comptes des Pandas » : dry-run du rattrapage PS-20 + bouton de création.
// Aucune logique métier ici : tout passe par GET/POST /api/admin/panda-accounts/backfill (inchangée).
export default async function ComptesPandasPage() {
  await requireAdminPage()
  return <ComptesPandasClient />
}
