import { requireAdminPage } from "@/lib/auth/admin"
import { CoursesClient } from "./CoursesClient"

export const dynamic = "force-dynamic"

export default async function CoursesPage() {
  await requireAdminPage()
  return <CoursesClient />
}
