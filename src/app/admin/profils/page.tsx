import { requireAdminPage } from "@/lib/auth/admin"
import { ProfilsClient } from "./ProfilsClient"

export const dynamic = "force-dynamic"

export default async function AdminProfilsPage() {
  await requireAdminPage()
  return <ProfilsClient />
}
