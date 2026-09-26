import Link from "next/link"
import { requireAdminPage } from "@/lib/auth/admin"

export const dynamic = "force-dynamic"

// PS-06b — Placeholder de la route /admin/clients (nav « Clients »).
// La liste complète des comptes + le crédit wallet manuel arrivent en PS-06a ;
// cette page réserve la route et oriente en attendant vers l'ancienne vue Profils.
export default async function ClientsPage() {
  await requireAdminPage()
  return (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "24px 16px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" }}>
      <Link href="/admin/dashboard" style={{ color: "var(--accent)", textDecoration: "none", fontSize: 14 }}>← Service du jour</Link>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "12px 0 8px" }}>Clients</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, lineHeight: 1.5 }}>
        La fiche complète des comptes (soldes, historique wallet, crédit manuel) arrive très bientôt.
      </p>
      <Link href="/admin/profils" style={{ display: "inline-block", marginTop: 16, color: "var(--accent)", fontWeight: 700, textDecoration: "none" }}>
        Voir les profils enfants →
      </Link>
    </div>
  )
}
