import { requireAdminPage } from "@/lib/auth/admin"
import { HomeClient } from "./HomeClient"

export const dynamic = "force-dynamic"

// PS-06e — accueil admin (destination après connexion + start_url du manifest admin).
export default async function AdminHomePage() {
  await requireAdminPage()
  return <HomeClient />
}
