// Bandeau d'accueil /commander — PS-01 Rentrée 2026.
// Texte éditable ici sans toucher au composant (CommanderClient). Permanent, non daté.
export const RENTREE_BANNER = {
  title: "À la rentrée, Panda prévoit tout : le repas commandé d'avance, le snack sur place.",
  subtitle: "Ouvert les mercredis et samedis, à partir de 12h et jusqu'à la fin des cours.",
} as const

// Libellés de sections /commander (PS-01 Opération Beauty), indexés par catalog_categories.id.
// L'emoji vient toujours de la DB (catalog_categories.emoji) ; ici uniquement le titre affiché
// quand on veut un libellé différent du `name` DB. Absent → on affiche le `name` DB.
export const SECTION_LABELS: Record<string, string> = {
  SAND: "Sandwichs & Clubs",
  SOUP: "Soupe-repas",
  DRINK: "Boissons",
}

export const SNACK_SECTION = { title: "Un petit en-cas", emoji: "🍿" } as const
export const COMING_SOON_LABEL = "Bientôt disponible !"
