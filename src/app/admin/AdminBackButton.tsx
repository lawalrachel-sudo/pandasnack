import Link from "next/link"

// PS-06e — bouton « ← Accueil admin » identique en haut de toutes les pages /admin/*.
export function AdminBackButton() {
  return (
    <Link
      href="/admin/home"
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, minHeight: 44,
        color: "var(--accent, #C85A3C)", textDecoration: "none", fontSize: 14, fontWeight: 600,
        fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif",
      }}
    >
      ← Accueil admin
    </Link>
  )
}
