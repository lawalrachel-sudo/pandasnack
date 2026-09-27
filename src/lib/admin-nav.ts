// PS-06e — Configuration des tuiles de l'accueil admin (/admin/home).
// Une seule source de vérité (liste + ordre + état grisé), testée.
// Décision 32 (24/09) : des tuiles, pas de pilules ni d'onglets.

export interface AdminTile {
  key: string
  label: string
  emoji: string
  /** href statique, ou modèle avec {date} rempli par le client pour les pages datées. */
  href: string
  /** true → tuile grisée non cliquable. */
  disabled?: boolean
  /** badge affiché sur une tuile grisée (ex. « Bientôt »). */
  badge?: string
  /** la tuile a besoin de la date du prochain service dans son href. */
  needsDate?: boolean
}

export const ADMIN_TILES: AdminTile[] = [
  { key: "service", label: "Service du jour", emoji: "🍽", href: "/admin/dashboard" },
  { key: "veille", label: "Veille", emoji: "🧊", href: "/admin/veille/{date}", needsDate: true },
  { key: "etiquettes", label: "Étiquettes", emoji: "🏷", href: "/admin/etiquettes/{date}", needsDate: true },
  { key: "clients", label: "Clients", emoji: "👥", href: "/admin/clients" },
  { key: "historique", label: "Historique", emoji: "📜", href: "/admin/historique" },
  { key: "calculette", label: "Calculette", emoji: "🧮", href: "/calculette-prix-revient-panda-snack.html" },
  { key: "boutique", label: "Boutique", emoji: "🛒", href: "/admin/boutique" },
  { key: "labo", label: "Labo", emoji: "🧪", href: "#", disabled: true, badge: "Bientôt" },
]

/** Résout le href d'une tuile en injectant la date du prochain service quand nécessaire. */
export function tileHref(tile: AdminTile, date: string): string {
  if (tile.disabled) return "#"
  return tile.needsDate ? tile.href.replace("{date}", date) : tile.href
}
