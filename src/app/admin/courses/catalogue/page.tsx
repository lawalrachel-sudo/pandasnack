import { requireAdminPage } from "@/lib/auth/admin"
import { CatalogueClient } from "./CatalogueClient"
export const dynamic = "force-dynamic"
export default async function CoursesCataloguePage() {
  await requireAdminPage()
  return <CatalogueClient />
}
