import { requireAdminPage } from "@/lib/auth/admin"
import { ClientDetailClient } from "./ClientDetailClient"

export const dynamic = "force-dynamic"

// PS-06a §2/§3 — fiche compte + crédit manuel du wallet.
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  return <ClientDetailClient accountId={id} />
}
