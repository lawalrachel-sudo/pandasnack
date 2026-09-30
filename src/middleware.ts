import { updateSession } from '@/lib/supabase/middleware'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // PS-02/PS-11 — fichiers publics (manifests, sw.js, icônes, _next, favicon) hors middleware :
    // ils ne doivent jamais être redirigés vers /auth (installation PWA, worker).
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|webmanifest|js)$).*)',
  ],
}
