import type { CookieOptions } from "@supabase/ssr"

// PS-05b §4 — session parents longue : les cookies d'auth Supabase (@supabase/ssr) sont
// posés avec un maxAge de 90 jours, secure + sameSite lax, pour que la connexion survive
// à la fermeture de la PWA installée. Le refresh token Supabase (longue durée par défaut)
// est ainsi conservé côté navigateur ; le flux magic link / mot de passe est inchangé.
export const PARENT_SESSION_MAX_AGE = 60 * 60 * 24 * 90 // 90 jours en secondes

// N'allonge que les cookies d'auth Supabase (préfixe sb-). Les cookies d'effacement
// (maxAge 0 / value vide, posés à la déconnexion) sont laissés intacts.
export function withLongSession(name: string, options: CookieOptions): CookieOptions {
  if (!name.startsWith("sb-")) return options
  if (options?.maxAge === 0) return options
  return {
    ...options,
    maxAge: PARENT_SESSION_MAX_AGE,
    sameSite: options?.sameSite ?? "lax",
    secure: options?.secure ?? process.env.NODE_ENV === "production",
  }
}
