import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerSupabase } from "@/lib/supabase/server"
import { hasValidAdminCookie } from "@/lib/auth/admin-cookie"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { IMPERSONATION_COOKIE } from "@/lib/impersonation"

export const dynamic = "force-dynamic"

// POST /api/admin/impersonate/exit — ferme la « vue client ».
//
// PS-13c — ne requiert PLUS requireAdmin : fermer SA PROPRE session test et effacer le marqueur
// n'exige aucun privilège, et l'exiger provoquait l'incident du 01/10 (sur Android, le cookie
// admin httpOnly — posé dans la PWA 🥘 de scope /admin/ — est absent du contexte hors-scope où
// tourne /commander ; requireAdmin tombait alors sur la session test non-admin → 403 → page mot
// de passe silencieuse, session test jamais fermée). On ferme TOUJOURS la session test, puis :
//   • cookie admin encore valide → retour /admin/home (l'admin reste connecté) ;
//   • cookie admin perdu        → /admin?msg=session_perdue (page connexion + message clair).
export async function POST() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()

  // Journalise la sortie (best-effort) avec le compte test courant.
  try {
    const { data: { user } } = await ssr.auth.getUser()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = getSupabaseAdmin()
    if (admin && user?.email) {
      const { data: acc } = await admin.from("accounts").select("id").eq("auth_user_id", user.id).maybeSingle()
      await admin.from("impersonation_log").insert({ target_account_id: acc?.id || null, target_email: user.email, action: "exit" })
    }
  } catch { /* non bloquant */ }

  try { await ssr.auth.signOut() } catch { /* efface les cookies Supabase, jamais le cookie admin */ }

  const store = await cookies()
  store.set(IMPERSONATION_COOKIE, "", { httpOnly: false, sameSite: "lax", path: "/", maxAge: 0 })

  const adminStillValid = await hasValidAdminCookie()
  const redirect = adminStillValid ? "/admin/home" : "/admin?msg=session_perdue"
  return NextResponse.json({ ok: true, adminStillValid, redirect })
}
