// Bandeau d'accueil /commander — PS-01 Rentrée 2026.
// Texte éditable ici sans toucher au composant (CommanderClient). Permanent, non daté.
export const RENTREE_BANNER = {
  title: "À la rentrée, Panda prévoit tout : le repas commandé d'avance, le snack sur place.",
  subtitle: "Ouvert le mercredi et le samedi dès 12h, jusqu'au début des cours (fermé pendant les cours). Le samedi, on rouvre à l'inter-cours, de 15h à 15h30.",
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

// PS-02 — Toast pédagogique « Comment ça marche ? » (/commander) : auto 2 s après l'arrivée,
// rappel via la pilule sous le bandeau. `key` = étape que les parents oublient (en premier, en gras).
export const HOWTO_TITLE = "Comment ça marche ?"
export const HOWTO_PILL = "Comment ça marche ?"
export const HOWTO_STEPS: ReadonlyArray<{ icon: string; text: string; key?: boolean }> = [
  { icon: "📅", text: "Choisis le JOUR de ton repas (mercredi ou samedi).", key: true },
  { icon: "🍱", text: "Choisis ton plat : Menu Panda (plat + Bubble Tea + dessert) ou un article seul." },
  { icon: "🥗", text: "Pour un sandwich ou un club : choisis tes crudités." },
  { icon: "⏰", text: "Commande avant la veille 20h ; paiement en ligne ou sur place." },
]
