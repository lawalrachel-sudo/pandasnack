import { requireAdminPage } from "@/lib/auth/admin"
import { CompterClient } from "./CompterClient"

export const dynamic = "force-dynamic"

// PS-24 — Comptage des espèces en un geste : une journée à la fois, la plus ancienne d'abord.
export default async function CompterPage() {
  await requireAdminPage()
  return <CompterClient />
}
