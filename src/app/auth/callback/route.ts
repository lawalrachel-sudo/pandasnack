import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { destinationApresAuth } from '@/lib/profil-gate'
import { withLongSession } from '@/lib/supabase/cookie-options'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/commander'

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, withLongSession(name, options))
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // PS-05c — la destination ne se décide plus sur `source_group` (posé par le
        // trigger de création de compte, donc toujours rempli : tout le monde filait
        // sur /commander sans jamais voir l'onboarding), mais sur la présence d'un
        // profil enfant réellement commandable.
        const { data: account } = await supabase
          .from('accounts')
          .select('id, source_group, telephone, cgu_accepted_at')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        const { data: profils } = account
          ? await supabase
              .from('profils')
              .select('active, classe, metier, type_profil, archived_at')
              .eq('account_id', account.id)
          : { data: [] }

        return NextResponse.redirect(`${origin}${destinationApresAuth(account, profils, next)}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Auth error — redirect to auth page
  return NextResponse.redirect(`${origin}/auth?error=auth_failed`)
}
