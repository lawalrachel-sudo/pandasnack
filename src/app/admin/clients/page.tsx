import { requireAdminPage } from "@/lib/auth/admin"
import { ClientsClient } from "./ClientsClient"

export const dynamic = "force-dynamic"

// PS-06a §1 — liste des comptes parents (remplace le placeholder PS-06b).
export default async function ClientsPage() {
  await requireAdminPage()
  return <ClientsClient />
}
