/**
 * HeaderMetier — affiche le nom du métier (source_group) en haut de page.
 * Utilisé sur /commander, /panier, /planning, /mon-espace pour orientation visuelle.
 *
 * sg accepte string (1 metier) ou string[] (multi profils → join " · ") ou null (skip).
 */

const LABELS: Record<string, string> = {
  ecole_la_patience: "École La Patience",
  pandattitude: "Pandattitude",
  panda_guest: "Panda Guest",
}

interface Props {
  sg: string | string[] | null | undefined
}

export function HeaderMetier({ sg }: Props) {
  if (!sg) return null

  const sgs = Array.isArray(sg) ? sg.filter(Boolean) : [sg]
  const labels = sgs.map((s) => LABELS[s] || s).filter(Boolean)
  if (labels.length === 0) return null

  return (
    <div className="px-4 pt-3 pb-1">
      <h1 className="font-bold text-base text-center" style={{ color: "var(--ink)" }}>
        {labels.join(" · ")}
      </h1>
    </div>
  )
}
