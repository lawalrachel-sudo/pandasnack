import { requireAdminPage } from "@/lib/auth/admin"
import { BoutiqueClient } from "./BoutiqueClient"

export const dynamic = "force-dynamic"

// PS-08a — écran de vente comptoir.
export default async function BoutiquePage() {
  await requireAdminPage()
  return <BoutiqueClient />
}
