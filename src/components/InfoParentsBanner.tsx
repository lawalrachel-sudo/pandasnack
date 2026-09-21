"use client"

import { useEffect, useState } from "react"

// PS-04 — Bandeau « Info parents » : commande la veille avant 20h. Visible par TOUS les parents à
// chaque visite (aucun bouton fermer, aucun localStorage), juste sous le bandeau horaires (PS-03).
// Même famille visuelle que RENTREE_BANNER ; la distinction = icône ⏰ + contenu.
// PS-04c — contraste : le couple du bandeau horaires (--accent #C85A3C / blanc) vaut 4,21:1 (< 4,5 AA),
// donc fond sombre --ink (#3A2A20) + texte crème --bg (#FBF5EC) = 12,65:1 (tokens existants).
// Disparaît automatiquement après INFO_PARENTS_UNTIL (date calendaire en heure Martinique, UTC-4).
export const INFO_PARENTS_UNTIL = "2026-10-07"

const INFO_PARENTS = {
  title: "Merci de commander la veille avant 20h.",
  body: "Je ne peux plus assurer les commandes de dernière minute, et encore moins le jour même, 5 minutes avant les cours. Panda Snack est là pour vous faciliter la vie de parent — en s'organisant ensemble, ce sera parfait pour vos enfants !",
} as const

// 'YYYY-MM-DD' du jour en Martinique (America/Martinique = UTC-4, sans heure d'été)
function todayMartinique(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Martinique", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

export function InfoParentsBanner() {
  // Décision côté client après montage : la page d'accueil peut être pré-rendue, la date ne doit
  // pas être figée au build ni provoquer de mismatch d'hydratation.
  const [visible, setVisible] = useState(false)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setVisible(todayMartinique() <= INFO_PARENTS_UNTIL) }, [])
  /* eslint-enable react-hooks/set-state-in-effect */
  if (!visible) return null

  return (
    <section aria-label="Info parents" className="px-4 pb-4">
      <div className="rounded-2xl px-4 py-4 text-center font-display" style={{ background: "var(--ink)", color: "var(--bg)", boxShadow: "0 2px 16px var(--shadow)" }}>
        <p className="font-semibold text-lg leading-snug"><span aria-hidden="true">⏰</span> {INFO_PARENTS.title}</p>
        <p className="text-sm mt-1.5 font-normal">{INFO_PARENTS.body}</p>
      </div>
    </section>
  )
}
