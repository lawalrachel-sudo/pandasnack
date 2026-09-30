import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { withLongSession } from './cookie-options'
import { ADMIN_COOKIE_NAME, adminCookieOptions, signAdminSession, verifyAdminSession } from '@/lib/auth/admin-session'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, withLongSession(name, options))
          )
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()

  // Redirect to /auth if not logged in (except public pages)
  // /api/stripe/webhook : POST sans cookies de la part de Stripe → ne JAMAIS rediriger vers /auth
  // (sinon Stripe reçoit 307 au lieu d'atteindre le handler → 21/21 failed observés en prod)
  // /admin + /api/admin : accès admin par mot de passe (cookie signé, sans session Supabase).
  // On ne redirige donc PAS vers /auth ici — la garde réelle se fait dans requireAdminPage()
  // (server components) et requireAdmin() (API routes), qui acceptent le cookie OU le compte admin.
  // PS-11 — Garde des pages /admin/* (cookie mot de passe signé, validation PARTAGÉE avec la
  // page /admin via admin-session.ts). Deux effets :
  //   1. anonyme sur une page admin protégée → /admin?next=… (JAMAIS "/") ;
  //   2. cookie valide → on le RENOUVELLE sur cette navigation (top-level), ce qui contourne le
  //      plafond ITP de 7 jours appliqué aux cookies posés hors navigation (login/renew XHR).
  const path = request.nextUrl.pathname
  if (path.startsWith('/admin')) {
    const secret = process.env.ADMIN_COOKIE_SECRET || ''
    const cookieVal = request.cookies.get(ADMIN_COOKIE_NAME)?.value
    if (await verifyAdminSession(cookieVal, secret)) {
      supabaseResponse.cookies.set(ADMIN_COOKIE_NAME, await signAdminSession(secret), adminCookieOptions())
      return supabaseResponse
    }
    // Pas de cookie valide : la page /admin (connexion) et un compte Supabase is_admin restent
    // autorisés ; sinon on renvoie vers la connexion admin avec le chemin demandé.
    if (path !== '/admin' && !user) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin'
      url.search = ''
      url.searchParams.set('next', path)
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  const publicPaths = ['/auth', '/allergenes', '/nos-prix-shop', '/cgv', '/cgu', '/api/stripe/webhook', '/admin', '/api/admin', '/boutique']
  const isPublic = publicPaths.some(p => request.nextUrl.pathname.startsWith(p))

  if (!user && !isPublic && request.nextUrl.pathname !== '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
