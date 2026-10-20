import { requireAdminPage } from "@/lib/auth/admin"
import { CartesClient } from "./CartesClient"

export const dynamic = "force-dynamic"

// PS-28 — l'ancienne vue cartes + stepper de PS-25 reste accessible (quantités), hors écran principal.
export default async function CoursesCartesPage() {
  await requireAdminPage()
  return <CartesClient />
}
