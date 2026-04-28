"use client"

import { useState } from "react"

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
}: ProductCardProps) {
  const [showAllergens, setShowAllergens] = useState(false)

  const priceDisplay =
    isMenuOnly || priceCents == null
      ? "en menu"
      : `${(priceCents / 100).toFixed(2).replace(".", ",")} €`

  const allergenList =
    allergens && allergens.length > 0 ? allergens.join(" · ") : null

  return (
    <div
      className="rounded-2xl overflow-hidden cursor-pointer transition-transform hover:scale-[1.02]"
      style={{ background: "var(--card)", boxShadow: `0 2px 12px var(--shadow)` }}
      onClick={() => onSelect(id)}
    >
      <div className="aspect-[4/3] overflow-hidden">
        {imageUrl ? (
          <img
            src={buildImageUrl(imageUrl)}
            alt={name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "var(--bg-alt)", fontSize: "5rem", lineHeight: 1 }}
            aria-label={name}
          >
            <span role="img">{emoji ?? "🐼"}</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <h4 className="font-semibold text-sm">{name}</h4>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
            {description}
          </p>
        )}

        {/* Allergen link */}
        <button
          className="text-[11px] mt-1 underline underline-offset-2 decoration-dotted"
          style={{ color: "var(--ink-soft)" }}
          onClick={(e) => {
            e.stopPropagation()
            setShowAllergens(!showAllergens)
          }}
        >
          Allergènes
        </button>

        {showAllergens && (
          <div
            className="mt-1 text-[11px] px-2 py-1 rounded-lg"
            style={{ background: "var(--bg-alt)" }}
          >
            <strong>{name}</strong>
            <br />
            {allergenList ? (
              <span style={{ color: "var(--accent)" }}>{allergenList}</span>
            ) : (
              <span style={{ color: "var(--accent-2)" }}>
                Aucun allergène majeur
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-2 gap-2">
          <span className="font-bold text-base whitespace-nowrap">{priceDisplay}</span>
          <span
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white whitespace-nowrap"
            style={{ background: "var(--accent)" }}
          >
            {isMenuOnly ? "Via Menu" : "Ajouter"}
          </span>
        </div>
      </div>
    </div>
  )
}
