import { requireAdminPage } from "@/lib/auth/admin"
import { BubbleTeaClient } from "./BubbleTeaClient"

export const dynamic = "force-dynamic"

// PS-23 — Admin Bubble Tea : parfums (sirop) + bubbles (perles), stock estimé, réassort, inventaire.
export default async function BubbleTeaPage() {
  await requireAdminPage()
  return <BubbleTeaClient />
}
