"use client"

import { useState } from "react"
import { COMING_SOON_LABEL } from "@/lib/banner"

interface ProductCardProps {
  id: string
  name: string
  description?: string | null
  priceCents: number | null
  imageUrl?: string | null
  emoji?: string | null
  isMenuOnly: boolean
  allergens?: string[] | null
  onSelect: (id: string) => void
  /** Libellé du bouton (« Ajouter » par défaut, « Choisir » dans le swipe Menu Panda). */
  ctaLabel?: string
  /** Prix affiché en override (ex. prix du Menu Panda dans le swipe). */
  priceLabel?: string
  /** PS-01 — catalog_items.coming_soon : visible, grisé, badge, aucun onClick. */
  comingSoon?: boolean
  /** Description masquée par défaut (cartes compactes) ; true pour l'afficher. */
  showDescription?: boolean
}

// Crop appliqué aux images Cloudinary pour retirer le watermark Gemini (coin bas-droit)
const CLOUDINARY_CROP = "c_crop,g_north_west,w_0.93,h_0.88/c_fill,ar_4:3,w_400,q_auto,f_auto"

function buildImageUrl(url: string): string {
  // Exception : tea_maison (image maison sans watermark à préserver)
  if (url.includes("res.cloudinary.com") && !url.includes("tea_maison")) {
    return url.replace("/upload/", `/upload/${CLOUDINARY_CROP}/`)
  }
  return url
}

function fmtPrice(c: number): string {
  return `${(c / 100).toFixed(2).replace(".", ",")} €`
}

export function ProductCard({
  id,
  name,
  description,
  priceCents,
  imageUrl,
  emoji,
  isMenuOnly,
  allergens,
  onSelect,
  ctaLabel = "Ajouter",
  priceLabel,
  comingSoon = false,
  showDescription = false,
}: ProductCardProps) {
  const [showAllergens, setShowAllergens] = useState(false)

  const priceDisplay = priceLabel ?? (isMenuOnly || priceCents == null ? "en menu" : fmtPrice(priceCents))
  const allergenList = allergens && allergens.length > 0 ? allergens.join(" · ") : null

  const image = imageUrl ? (
    <img src={buildImageUrl(imageUrl)} alt={name} loading="lazy" />
  ) : (
    <div className="w-full h-full flex items-center justify-center" style={{ fontSize: "3.5rem", lineHeight: 1 }} aria-label={name}>
      <span role="img">{emoji ?? "🐼"}</span>
    </div>
  )

  return (
    <div
      className={`pcard ${comingSoon ? "pcard-soon" : "cursor-pointer transition-transform hover:scale-[1.02]"}`}
      onClick={comingSoon ? undefined : () => onSelect(id)}
      role={comingSoon ? undefined : "button"}
      aria-disabled={comingSoon || undefined}
    >
      {comingSoon && <span className="soon-badge">{COMING_SOON_LABEL}</span>}
      <div className={comingSoon ? "pcard-soon-body" : "flex flex-col flex-1"}>
        <div className="pcard-img">{image}</div>
        <div className="p-2.5 flex flex-col flex-1">
          <h4 className="font-display font-semibold text-sm leading-tight" style={{ color: "var(--ink)" }}>{name}</h4>
          {showDescription && description && (
            <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>{description}</p>
          )}

          <div className="flex items-center justify-between mt-1 gap-2">
            <span className="font-display font-semibold text-base whitespace-nowrap">{priceDisplay}</span>
            {/* Allergènes — lien discret, n'ouvre pas la sélection */}
            <button
              type="button"
              className="text-[11px] underline underline-offset-2 decoration-dotted"
              style={{ color: "var(--ink-soft)" }}
              aria-expanded={showAllergens}
              onClick={(e) => { e.stopPropagation(); setShowAllergens((v) => !v) }}
            >
              ⓘ Allergènes
            </button>
          </div>

          {showAllergens && (
            <div className="mt-1 text-[11px] px-2 py-1 rounded-lg" style={{ background: "var(--bg-alt)" }} onClick={(e) => e.stopPropagation()}>
              {allergenList
                ? <span style={{ color: "var(--accent)" }}>{allergenList}</span>
                : <span style={{ color: "var(--accent-2)" }}>Aucun allergène majeur</span>}
            </div>
          )}

          <div className="mt-auto pt-2">
            {comingSoon ? (
              <span className="pcard-btn text-xs" aria-hidden="true">{COMING_SOON_LABEL}</span>
            ) : (
              <span className="pcard-btn text-sm">{isMenuOnly ? "Via Menu" : ctaLabel}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
