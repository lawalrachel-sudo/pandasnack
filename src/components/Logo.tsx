import Link from "next/link"

/**
 * Composant Logo unifié — bannière "PANDA SNACK + panda chef + couverts".
 * 5 tailles standardisées :
 * - sm   ~40px (badges / contextes mini)
 * - md   ~80px (header sticky compact)
 * - lg   ~150px (écrans auth / onboarding)
 * - xl   ~250px (landing / accueil)
 * - 2xl  ~320px (header sticky pages métier — visibilité maximale)
 */

const LOGO_BASE = "https://res.cloudinary.com/dbkpvp9ts/image/upload"
const LOGO_VERSION = "v1777335338"
const LOGO_FILE = "PANDA_SNACK_LOGO_transparent.png"

// Cloudinary transform : h_X (2x render height pour retina) + q_auto,f_auto
const SIZES: Record<"sm" | "md" | "lg" | "xl" | "2xl", { height: number; transform: string }> = {
  sm: { height: 40, transform: "h_80,q_auto,f_auto" },
  md: { height: 80, transform: "h_160,q_auto,f_auto" },
  lg: { height: 150, transform: "h_300,q_auto,f_auto" },
  xl: { height: 250, transform: "h_500,q_auto,f_auto" },
  "2xl": { height: 320, transform: "h_640,q_auto,f_auto" },
}

interface LogoProps {
  size: "sm" | "md" | "lg" | "xl" | "2xl"
  link?: boolean
  className?: string
  alt?: string
}

export function Logo({ size, link = false, className = "", alt = "Panda Snack" }: LogoProps) {
  const cfg = SIZES[size]
  const src = `${LOGO_BASE}/${cfg.transform}/${LOGO_VERSION}/${LOGO_FILE}`

  const img = (
    <img
      src={src}
      alt={alt}
      style={{ height: cfg.height, width: "auto" }}
      className={className}
    />
  )

  if (link) {
    return (
      <Link href="/commander" aria-label="Accueil Panda Snack">
        {img}
      </Link>
    )
  }
  return img
}
