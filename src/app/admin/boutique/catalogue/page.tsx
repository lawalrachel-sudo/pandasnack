import { requireAdminPage } from "@/lib/auth/admin"
import { CatalogueClient } from "./CatalogueClient"

export const dynamic = "force-dynamic"

// PS-08a — catalogue comptoir (édition articles goûter).
export default async function CataloguePage() {
  await requireAdminPage()
  return <CatalogueClient />
}
