import { createServerSupabase } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { type EmailOtpType } from "@supabase/supabase-js"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/commander"

  if (token_hash && type) {
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      // CAS SPÉCIAL: récupération de mot de passe → toujours rediriger vers /auth/reset
      // (peu importe l'état du compte)
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/auth/reset`)
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // FIX BUG 3: select id ET source_group (avant: select('id') seul → source_group toujours undefined)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: account } = await (supabase as any)
          .from('accounts')
          .select('id, source_group')
          .eq('auth_user_id', user.id)
          .single()

        const dest = (account && account.source_group && account.source_group !== 'divers') ? next : '/onboarding'
        return NextResponse.redirect(`${origin}${dest}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=confirm_failed`)
}
