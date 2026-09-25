import { createServerSupabase } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { type EmailOtpType } from "@supabase/supabase-js"
import { destinationApresAuth } from "@/lib/profil-gate"

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
        // PS-05c — même règle que /auth/callback : c'est la présence d'un profil enfant
        // commandable qui décide, pas `source_group` (toujours posé par le trigger).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: account } = await (supabase as any)
          .from('accounts')
          .select('id, source_group, telephone, cgu_accepted_at')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        const { data: profils } = account
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? await (supabase as any)
              .from('profils')
              .select('active, classe, metier, type_profil, archived_at')
              .eq('account_id', account.id)
          : { data: [] }

        return NextResponse.redirect(`${origin}${destinationApresAuth(account, profils, next)}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=confirm_failed`)
}
