import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { IMPERSONATION_COOKIE } from "@/lib/impersonation"

export const dynamic = "force-dynamic"

// POST /api/admin/impersonate/exit — ferme la session client (test), conserve le cookie admin,
// renvoie vers /admin/home.
export async function POST() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr) // le cookie admin doit être intact
  if ("error" in auth) return auth.error

  // Journalise la sortie (avant fermeture) avec le compte test courant.
  try {
    const { data: { user } } = await ssr.auth.getUser()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = getSupabaseAdmin()
    if (admin && user?.email) {
      const { data: acc } = await admin.from("accounts").select("id").eq("auth_user_id", user.id).maybeSingle()
      await admin.from("impersonation_log").insert({ target_account_id: acc?.id || null, target_email: user.email, action: "exit" })
    }
  } catch { /* non bloquant */ }

  await ssr.auth.signOut() // efface les cookies de session Supabase (pas le cookie admin)
  const store = await cookies()
  store.set(IMPERSONATION_COOKIE, "", { httpOnly: false, sameSite: "lax", path: "/", maxAge: 0 })

  return NextResponse.json({ ok: true, redirect: "/admin/home" })
}
