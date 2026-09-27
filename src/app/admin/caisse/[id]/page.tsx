import { requireAdminPage } from "@/lib/auth/admin"
import { ClotureClient } from "./ClotureClient"

export const dynamic = "force-dynamic"

// PS-08a-b — Clôture figée, présentation A4 imprimable.
export default async function CloturePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  return <ClotureClient id={id} />
}
