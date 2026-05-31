import { requireAdminPage } from "@/lib/auth/admin"
import { DashboardClient } from "./DashboardClient"

export const dynamic = "force-dynamic"

export default async function AdminDashboardPage() {
  const { userEmail } = await requireAdminPage()
  return <DashboardClient userEmail={userEmail} />
}
