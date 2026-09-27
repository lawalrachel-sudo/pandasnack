import { requireAdminPage } from "@/lib/auth/admin"
import { CaisseClient } from "./CaisseClient"

export const dynamic = "force-dynamic"

// PS-08a-b — Caisse du jour : Z live, clôtures, rapprochement espèces, analytique.
export default async function CaissePage() {
  await requireAdminPage()
  return <CaisseClient />
}
