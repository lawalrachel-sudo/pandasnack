import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { IMPERSONATION_COOKIE } from "@/lib/impersonation"

export const dynamic = "force-dynamic"

// POST /api/admin/impersonate  body: { accountId? }
// PS-13 — « Vue client » : ouvre une session Supabase pour un compte CIBLE, uniquement si
// accounts.is_test = true (garde-fou dur serveur). Aucun mot de passe : magic link généré en
// service_role puis consommé côté serveur. Le cookie admin reste intact (double contexte).
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const auth = await requireAdmin(ssr)
  if ("error" in auth) return auth.error // non-admin → 401/403

  const body = await req.json().catch(() => ({}))
  const accountId = typeof body?.accountId === "string" ? body.accountId : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  // Cibles autorisées = comptes is_test UNIQUEMENT. Aucun paramètre client ne force un non-test.
  let q = admin.from("accounts").select("id, email, nom_compte, is_test").eq("is_test", true)
  if (accountId) q = q.eq("id", accountId)
  const { data: rows } = await q
  const targets = (rows || []) as Array<{ id: string; email: string | null; nom_compte: string | null; is_test: boolean }>
  const target = accountId ? targets[0] : (targets.length === 1 ? targets[0] : null)

  if (accountId && !target) return NextResponse.json({ error: "Compte non autorisé (test uniquement)" }, { status: 403 })
  if (!accountId && !target) return NextResponse.json({ error: "Choisis un compte test", code: "MULTIPLE" }, { status: 400 })
  if (!target) return NextResponse.json({ error: "Compte cible introuvable" }, { status: 404 })
  if (!target.is_test) return NextResponse.json({ error: "Compte non autorisé (test uniquement)" }, { status: 403 })
  if (!target.email) return NextResponse.json({ error: "Compte cible sans e-mail" }, { status: 400 })

  // Session cible via magic link serveur (service_role), consommé immédiatement.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: target.email })
  const tokenHash: string | undefined = linkData?.properties?.hashed_token
  if (linkErr || !tokenHash) {
    console.error("[impersonate] generateLink", linkErr?.message)
    return NextResponse.json({ error: "Impossible d'ouvrir la session test" }, { status: 500 })
  }
  const { error: vErr } = await ssr.auth.verifyOtp({ token_hash: tokenHash, type: "email" })
  if (vErr) {
    console.error("[impersonate] verifyOtp", vErr.message)
    return NextResponse.json({ error: "Impossible d'ouvrir la session test" }, { status: 500 })
  }

  // Prénom pour le bandeau (1er enfant actif, sinon nom du compte).
  const { data: enfant } = await admin.from("profils")
    .select("prenom").eq("account_id", target.id).eq("type_profil", "eleve").eq("active", true)
    .order("created_at").limit(1).maybeSingle()
  const label = (enfant?.prenom || target.nom_compte || "Test").toString()

  const store = await cookies()
  store.set(IMPERSONATION_COOKIE, encodeURIComponent(label), { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 })

  await admin.from("impersonation_log").insert({ target_account_id: target.id, target_email: target.email, action: "enter" })
  return NextResponse.json({ ok: true, redirect: "/commander" })
}
