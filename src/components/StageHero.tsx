import { STAGE_HERO } from "@/lib/banner"

// PS-17 — Hero temporel « Stage de Toussaint » : bandeau d'annonce (orange), deux lignes.
// Affiché quand un créneau stage actif est à venir ; priorité derrière Sa ki ni (voir pickHero).
export function StageHero() {
  return (
    <section aria-label="Stage de Toussaint" className="px-4 pt-3 pb-4">
      <div className="rounded-2xl p-4" style={{ background: "var(--card, #fff)", border: "2px solid var(--stage, #E8731C)", boxShadow: "0 2px 16px rgba(232,115,28,0.18)" }}>
        <p className="font-display font-semibold text-base leading-snug" style={{ color: "var(--stage, #E8731C)" }}>{STAGE_HERO.title}</p>
        <p className="text-sm mt-1.5" style={{ color: "var(--ink-soft)" }}>{STAGE_HERO.subtitle}</p>
      </div>
    </section>
  )
}
